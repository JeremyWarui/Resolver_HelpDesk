"""Neither create nor update takes a name: the email is the identity."""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.identity import display_name, identity_from_email
from apps.accounts.models import ROLE_CHOICES, RoleAssignment, TechnicianTrade
from apps.accounts.posts import assign_role, ensure_requester, scope_kwargs_from_ids
from apps.org.models import Campus, Trade

User = get_user_model()


class CampusRosterSerializer(serializers.Serializer):
    """A campus and who staffs it, for the admin Campuses screen.

    Lives here rather than in `org` because both people fields are posts, and
    `RoleAssignment` is the only record of a post. `org` holds structure and
    names no user, which is what keeps the two apps one-directional.

    Both fields come from `CampusRosterView`'s queryset, so a page of campuses
    costs no query per row.
    """

    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True)
    location = serializers.CharField(read_only=True)
    hos = serializers.SerializerMethodField()
    hos_name = serializers.SerializerMethodField()
    technician_count = serializers.IntegerField(read_only=True)

    def get_hos(self, campus):
        holder = self._hos(campus)
        return holder.pk if holder else None

    def get_hos_name(self, campus):
        """None rather than "" when the post is vacant: an empty string reads
        as a head whose name nobody recorded.
        """
        holder = self._hos(campus)
        return display_name(holder) if holder else None

    @staticmethod
    def _hos(campus):
        posts = campus.hos_posts
        return posts[0].user if posts else None


class UserMinSerializer(serializers.Serializer):
    """How a person appears inside somebody else's payload.

    `full_name` is `identity.display_name` — never assembled at the call site,
    and never blank.
    """

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return display_name(obj)


class RoleAssignmentSerializer(serializers.ModelSerializer):
    """`campus_id` is null for an admin and a manager: their remit is every campus."""

    campus_id = serializers.IntegerField(read_only=True)
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    assigned_by_username = serializers.CharField(
        source="assigned_by.username", read_only=True
    )
    trade_ids = serializers.SerializerMethodField()

    class Meta:
        model = RoleAssignment
        fields = [
            "id",
            "role",
            "campus_id",
            "campus_name",
            "trade_ids",
            "assigned_by_username",
            "assigned_at",
        ]
        read_only_fields = fields

    def get_trade_ids(self, obj):
        """Empty for every other role."""
        if obj.role != "technician":
            return []
        return list(
            TechnicianTrade.objects.filter(user_id=obj.user_id).values_list(
                "trade_id", flat=True
            )
        )


class RoleAssignmentWriteSerializer(serializers.Serializer):
    """Replaces a user's role. It does not merge with what they held.

    Which roles carry a campus is not decided here: `posts.scope_kwargs_from_ids`
    reads it from `SCOPE_FIELD_BY_ROLE`, so this cannot drift from the rule
    `RoleAssignment.clean()` enforces on save.
    """

    role = serializers.ChoiceField(choices=ROLE_CHOICES)
    campus_id = serializers.IntegerField(required=False, allow_null=True)
    trade_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )

    def validate(self, attrs):
        role = attrs["role"]
        try:
            attrs["scope"] = scope_kwargs_from_ids(
                role, campus_id=attrs.get("campus_id")
            )
        except LookupError as exc:
            field, message = exc.args[0]
            raise serializers.ValidationError({field: message}) from exc

        attrs["trades"] = self._validate_trades(role, attrs.get("trade_ids") or [])
        return attrs

    def _validate_trades(self, role, trade_ids):
        if role != "technician":
            if trade_ids:
                raise serializers.ValidationError(
                    {"trade_ids": "Only technician assignments carry trades."}
                )
            return []

        if not trade_ids:
            raise serializers.ValidationError(
                {
                    "trade_ids": "A technician assignment requires at least one "
                    "trade, or they would see no tickets."
                }
            )
        found = list(Trade.objects.filter(pk__in=trade_ids))
        if len(found) != len(set(trade_ids)):
            raise serializers.ValidationError(
                {"trade_ids": "Every id must name a real trade."}
            )
        return found

    def save(self, target, actor=None):
        """Returns `(role_assignment, displaced_user)`."""
        return assign_role(
            target,
            self.validated_data["role"],
            trades=self.validated_data["trades"],
            actor=actor,
            **self.validated_data["scope"],
        )


class UserAdminSerializer(UserMinSerializer, serializers.ModelSerializer):
    """Two campuses appear here and they are different facts. `home_campus_*` is
    where the person works and routes the tickets they raise. `primary_campus_*`
    is what their role oversees, and is null for a manager, an admin and a plain
    requester. Never collapse the two: the ticket wizard routes off
    `home_campus_id`.
    """

    role = serializers.SerializerMethodField()
    primary_campus_id = serializers.SerializerMethodField()
    primary_campus_name = serializers.SerializerMethodField()
    home_campus_id = serializers.IntegerField(source="campus_id", read_only=True)
    home_campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "date_joined",
            "role",
            "primary_campus_id",
            "primary_campus_name",
            "home_campus_id",
            "home_campus_name",
        ]
        read_only_fields = fields

    def get_role(self, obj):
        return obj.role or "user"

    def get_primary_campus_id(self, obj):
        return obj.role_campus.pk if obj.role_campus else None

    def get_primary_campus_name(self, obj):
        return obj.role_campus.name if obj.role_campus else None


def _campus_must_exist(value):
    """None passes — an update uses it to clear the user's campus."""
    if value is not None and not Campus.objects.filter(pk=value).exists():
        raise serializers.ValidationError("Campus not found.")
    return value


def _email_must_be_free(value, instance=None):
    """Case-insensitive: two accounts differing only in case would be two ways
    to sign in as different people. `instance` is the account being updated,
    which does not collide with itself."""
    qs = User.objects.filter(email__iexact=value)
    if instance is not None:
        qs = qs.exclude(pk=instance.pk)
    if qs.exists():
        raise serializers.ValidationError("A user with this email already exists.")
    return value


def _email_must_carry_a_name(value):
    """`john@` is fine, `@ksg.ac.ke` is not — an account with no name to show
    renders as its username everywhere, forever, and the email cannot be edited
    into a name without renaming the login."""
    _, first, _ = identity_from_email(value)
    if not first:
        raise serializers.ValidationError(
            "The email must have a name before the '@' — e.g. john.doe@ksg.ac.ke"
        )
    return value


class UserCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    campus_id = serializers.IntegerField()

    def validate_email(self, value):
        return _email_must_carry_a_name(_email_must_be_free(value))

    def validate_campus_id(self, value):
        return _campus_must_exist(value)

    def create(self, validated_data):
        """Registration and admin-create both post through here, so there is
        one definition of what a new account is.
        """
        email = validated_data["email"]
        username, first_name, last_name = identity_from_email(email)
        user = User.objects.create_user(
            username=username,
            email=email,
            password=validated_data["password"],
            first_name=first_name,
            last_name=last_name,
            campus_id=validated_data["campus_id"],
        )
        ensure_requester(user)
        return user


class UserUpdateSerializer(serializers.Serializer):
    """Name and username are not editable — changing the email re-derives them,
    and there is no way to set one on its own."""

    email = serializers.EmailField(required=False)
    campus_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_email(self, value):
        return _email_must_carry_a_name(_email_must_be_free(value, self.instance))

    def validate_campus_id(self, value):
        return _campus_must_exist(value)

    def update(self, instance, validated_data):
        campus_id = validated_data.pop("campus_id", serializers.empty)
        email = validated_data.get("email")
        if email and email.lower() != (instance.email or "").lower():
            instance.email = email
            (
                instance.username,
                instance.first_name,
                instance.last_name,
            ) = identity_from_email(email, exclude_pk=instance.pk)
            instance.save(
                update_fields=["email", "username", "first_name", "last_name"]
            )
        if campus_id is not serializers.empty:
            instance.campus_id = campus_id
            instance.save(update_fields=["campus"])
        return instance
