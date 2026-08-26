"""How accounts renders a person, a role, and the two together.

`UserMinSerializer` is the one shape for "a person" in any API response.
Anything that puts a user in a payload imports it from here.

Used by:
    accounts.views       every endpoint under /auth/ and /users/
    org.serializers      UserMinSerializer
    org.views            UserMinSerializer, UserAdminSerializer
    tickets.serializers  UserMinSerializer
    tickets.views        UserMinSerializer
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.identity import display_name, identity_from_email
from apps.accounts.models import RoleAssignment, UserProfile
from apps.accounts.posts import assign_role, scope_kwargs_from_ids
from apps.accounts.scope import (
    SCOPE_FIELD_BY_ROLE,
    assignment_of,
    campus_for,
    department_for,
    home_campus,
)

User = get_user_model()


# ── A person ──────────────────────────────────────────────────────────────────


class UserMinSerializer(serializers.Serializer):
    """A person, as any payload refers to one.

    `full_name` is `identity.display_name` — never assembled at the call site,
    and never blank: a dotless email has no surname and `createsuperuser` skips
    the email rule, so the username is the fallback.
    """

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return display_name(obj)


# ── A role ────────────────────────────────────────────────────────────────────


class RoleAssignmentSerializer(serializers.ModelSerializer):
    """A RoleAssignment as every reader sees it: one shape, two endpoints.

    `/users/{id}/role-assignments/` returns it, and it is also the `active_role`
    of `/auth/me/`. `campus_id` and `department_id` come from `scope.campus_for`
    and `scope.department_for`, never from the direct FK, because a technician
    or an HOS reaches their department through their section.
    """

    section_id = serializers.IntegerField(read_only=True)
    section_name = serializers.SerializerMethodField()
    campus_id = serializers.SerializerMethodField()
    campus_name = serializers.SerializerMethodField()
    department_id = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    assigned_by_username = serializers.SerializerMethodField()
    sub_section_ids = serializers.SerializerMethodField()

    class Meta:
        model = RoleAssignment
        fields = [
            "id",
            "role",
            "campus_id",
            "campus_name",
            "department_id",
            "department_name",
            "section_id",
            "section_name",
            "sub_section_ids",
            "assigned_by_username",
            "assigned_at",
        ]
        read_only_fields = fields

    def get_section_name(self, obj):
        return str(obj.section) if obj.section_id else None  # "NRB-ADM-MTCE"

    def get_campus_id(self, obj):
        campus = campus_for(obj)
        return campus.pk if campus else None

    def get_campus_name(self, obj):
        campus = campus_for(obj)
        return campus.name if campus else None

    def get_department_id(self, obj):
        department = department_for(obj)
        return department.pk if department else None

    def get_department_name(self, obj):
        department = department_for(obj)
        return department.name if department else None

    def get_assigned_by_username(self, obj):
        return obj.assigned_by.username if obj.assigned_by_id else None

    def get_sub_section_ids(self, obj):
        """The trades a technician works — empty for every other role.

        They live in SectionTechnician because one role row cannot express
        "Carpentry and Plumbing at Nairobi".
        """
        if obj.role != "technician" or not obj.section_id:
            return []
        from apps.org.models import SectionTechnician

        return list(
            SectionTechnician.objects.filter(
                user_id=obj.user_id, section_id=obj.section_id
            ).values_list("sub_section_id", flat=True)
        )


class RoleAssignmentWriteSerializer(serializers.Serializer):
    """Takes campus_id/department_id/section_id and gives back scope objects.

    A user has one role, so POSTing this replaces whatever they held. Which
    scope each role needs is not decided here — `posts.scope_kwargs_from_ids`
    reads it from `SCOPE_FIELD_BY_ROLE`, so this serializer cannot drift from
    the rule `RoleAssignment.clean()` enforces on save.
    """

    role = serializers.ChoiceField(choices=RoleAssignment.ROLE_CHOICES)
    campus_id = serializers.IntegerField(required=False, allow_null=True)
    department_id = serializers.IntegerField(required=False, allow_null=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    sub_section_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )

    def validate(self, attrs):
        role = attrs["role"]
        try:
            attrs["scope"] = scope_kwargs_from_ids(
                role,
                campus_id=attrs.get("campus_id"),
                department_id=attrs.get("department_id"),
                section_id=attrs.get("section_id"),
            )
        except LookupError as exc:
            field, message = exc.args[0]
            raise serializers.ValidationError({field: message}) from exc

        attrs["sub_sections"] = self._validate_trades(
            role, attrs.get("sub_section_ids") or [], attrs["scope"].get("section")
        )
        return attrs

    def _validate_trades(self, role, sub_section_ids, section):
        """Trades are technician-only, and must belong to the section's type."""
        from apps.org.models import SubSection

        if role != "technician":
            if sub_section_ids:
                raise serializers.ValidationError(
                    {"sub_section_ids": "Only technician assignments carry sub-sections."}
                )
            return []

        if not sub_section_ids:
            raise serializers.ValidationError(
                {
                    "sub_section_ids": "A technician assignment requires at least one "
                    "sub-section, or they would see no tickets."
                }
            )
        found = list(
            SubSection.objects.filter(
                pk__in=sub_section_ids, section_type_id=section.section_type_id
            )
        )
        if len(found) != len(set(sub_section_ids)):
            raise serializers.ValidationError(
                {
                    "sub_section_ids": "Every sub-section must belong to the section's "
                    "section_type."
                }
            )
        return found

    def save(self, target, actor=None):
        """Apply the assignment. Returns `(role_assignment, displaced_user)`."""
        return assign_role(
            target,
            self.validated_data["role"],
            sub_sections=self.validated_data["sub_sections"],
            actor=actor,
            **self.validated_data["scope"],
        )


# ── A person and their role ───────────────────────────────────────────────────


class UserAdminSerializer(UserMinSerializer, serializers.ModelSerializer):
    """The admin user list, and the technician roster's person half.

    Two campuses appear here and they are different facts, so both names are
    spelled out. `home_campus_*` is where the person works and routes the
    tickets they raise. `primary_campus_*` is what their role oversees, and is
    null for a manager, an admin and a plain requester. Never collapse the two
    into one `campus_id`: the ticket wizard routes off `home_campus_id`.
    """

    role = serializers.SerializerMethodField()
    section_id = serializers.SerializerMethodField()
    section_name = serializers.SerializerMethodField()
    primary_campus_id = serializers.SerializerMethodField()
    primary_campus_name = serializers.SerializerMethodField()
    primary_department_id = serializers.SerializerMethodField()
    primary_department_name = serializers.SerializerMethodField()
    home_campus_id = serializers.SerializerMethodField()
    home_campus_name = serializers.SerializerMethodField()

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
            "section_id",
            "section_name",
            "primary_campus_id",
            "primary_campus_name",
            "primary_department_id",
            "primary_department_name",
            "home_campus_id",
            "home_campus_name",
        ]
        read_only_fields = fields

    def get_role(self, obj):
        ra = assignment_of(obj)
        return ra.role if ra else "user"

    def get_section_id(self, obj):
        ra = assignment_of(obj)
        return ra.section_id if ra else None

    def get_section_name(self, obj):
        ra = assignment_of(obj)
        return str(ra.section) if ra and ra.section_id else None

    def get_primary_campus_id(self, obj):
        campus = campus_for(assignment_of(obj))
        return campus.pk if campus else None

    def get_primary_campus_name(self, obj):
        campus = campus_for(assignment_of(obj))
        return campus.name if campus else None

    def get_primary_department_id(self, obj):
        department = department_for(assignment_of(obj))
        return department.pk if department else None

    def get_primary_department_name(self, obj):
        department = department_for(assignment_of(obj))
        return department.name if department else None

    def get_home_campus_id(self, obj):
        campus = home_campus(obj)
        return campus.pk if campus else None

    def get_home_campus_name(self, obj):
        campus = home_campus(obj)
        return campus.name if campus else None


# ── Creating and editing an account ───────────────────────────────────────────
# Neither takes a name. The email is the identity: username, first
# and last name are derived from its local part and never accepted from a
# client, so an account's display name and its login cannot drift apart.


def _campus_must_exist(value):
    """None passes — an update uses it to clear the profile campus."""
    from apps.org.models import Campus

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
    """`jeremy@` is fine, `@ksg.ac.ke` is not — an account with no name to show
    renders as its username everywhere, forever, and the email cannot be edited
    into a name without renaming the login."""
    _, first, _ = identity_from_email(value)
    if not first:
        raise serializers.ValidationError(
            "The email must have a name before the '@' — e.g. jeremy.mwangi@ksg.ac.ke"
        )
    return value


class UserCreateSerializer(serializers.Serializer):
    """Admin account creation. Registration goes through the same rules."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    campus_id = serializers.IntegerField()

    def validate_email(self, value):
        return _email_must_carry_a_name(_email_must_be_free(value))

    def validate_campus_id(self, value):
        return _campus_must_exist(value)

    def create(self, validated_data):
        return create_account(
            email=validated_data["email"],
            password=validated_data["password"],
            campus_id=validated_data["campus_id"],
        )


class UserUpdateSerializer(serializers.Serializer):
    """Admin account edit. Name and username are not editable — changing the
    email re-derives them, and there is no way to set one on its own."""

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
            UserProfile.objects.update_or_create(
                user=instance, defaults={"campus_id": campus_id}
            )
        return instance


def create_account(*, email, password, campus_id):
    """Make an account: identity from the email, a home campus, the floor role.

    Registration and admin-create both land here, so the two API paths cannot
    disagree about what an account is.

    Not the only way a CustomUser is created. `common.seed` builds its own
    identity and calls `User.objects.get_or_create` so it can stay idempotent
    and set a phone number, and `tests.factories` calls `create_user` directly.
    Both reach the same result by a different route.

    Called by UserCreateSerializer.create, which serves both /auth/register/
    and POST /users/.
    """
    from apps.accounts.posts import ensure_requester

    username, first_name, last_name = identity_from_email(email)
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )
    ensure_requester(user)
    UserProfile.objects.create(user=user, campus_id=campus_id)
    return user


# `SCOPE_FIELD_BY_ROLE` is re-exported for the admin form, which builds its
# scope inputs from the same declaration the API validates against.
__all__ = [
    "SCOPE_FIELD_BY_ROLE",
    "RoleAssignmentSerializer",
    "RoleAssignmentWriteSerializer",
    "UserAdminSerializer",
    "UserCreateSerializer",
    "UserMinSerializer",
    "UserUpdateSerializer",
    "create_account",
]
