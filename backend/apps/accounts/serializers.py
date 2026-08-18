from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.models import RoleAssignment, UserProfile
from apps.accounts.services import (
    campus_from_role_assignment,
    department_from_role_assignment,
    home_campus_from_user,
)

User = get_user_model()


# ── RoleAssignment serializers ────────────────────────────────────────────────


class RoleAssignmentSerializer(serializers.ModelSerializer):
    """Read serializer — fields match the frontend RoleAssignment interface."""

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
        if obj.section_id and obj.section:
            return str(obj.section)  # e.g. "NRB-ICT-SW"
        return None

    def get_campus_id(self, obj):
        c = campus_from_role_assignment(obj)
        return c.pk if c else None

    def get_campus_name(self, obj):
        c = campus_from_role_assignment(obj)
        return c.name if c else None

    def get_department_id(self, obj):
        d = department_from_role_assignment(obj)
        return d.pk if d else None

    def get_department_name(self, obj):
        d = department_from_role_assignment(obj)
        return d.name if d else None

    def get_assigned_by_username(self, obj):
        return (
            obj.assigned_by.username if obj.assigned_by_id and obj.assigned_by else None
        )

    def get_sub_section_ids(self, obj):
        """The trades a technician works, from SectionTechnician — empty for other roles.

        Technician scope lives in SectionTechnician, not here: one role row
        cannot express "Carpentry and Plumbing at Nairobi".
        """
        if obj.role != "technician" or not obj.section_id:
            return []
        from apps.org.models import SectionTechnician

        return list(
            SectionTechnician.objects.filter(
                user_id=obj.user_id, section_id=obj.section_id
            ).values_list("sub_section_id", flat=True)
        )


class RoleAssignmentCreateSerializer(serializers.Serializer):
    """Write serializer — accepts frontend-friendly campus_id/department_id/section_id.

    A user has one role, so POSTing this replaces whatever they had.
    `sub_section_ids` is technician-only and sets their trades in one action;
    without it a new technician would be left with a role but no ticket access.
    """

    role = serializers.ChoiceField(choices=RoleAssignment.ROLE_CHOICES)
    campus_id = serializers.IntegerField(required=False, allow_null=True)
    department_id = serializers.IntegerField(required=False, allow_null=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    sub_section_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )

    def validate(self, attrs):
        from apps.org.models import CampusDepartment, Department, Section, SubSection

        role = attrs["role"]
        campus_id = attrs.get("campus_id")
        department_id = attrs.get("department_id")
        section_id = attrs.get("section_id")

        attrs["section"] = None
        attrs["campus_department"] = None
        attrs["department"] = None

        if role in ("technician", "hos"):
            if not section_id:
                raise serializers.ValidationError(
                    {"section_id": f"A {role} assignment requires a section."}
                )
            try:
                attrs["section"] = Section.objects.get(pk=section_id)
            except Section.DoesNotExist:
                raise serializers.ValidationError({"section_id": "Section not found."})

        elif role == "hod":
            if not campus_id or not department_id:
                raise serializers.ValidationError(
                    {"campus_id": "HOD requires both campus_id and department_id."}
                )
            try:
                attrs["campus_department"] = CampusDepartment.objects.get(
                    campus_id=campus_id, department_id=department_id
                )
            except CampusDepartment.DoesNotExist:
                raise serializers.ValidationError(
                    {
                        "campus_id": "No campus-department found for that campus + department combination."
                    }
                )

        elif role == "manager":
            if not department_id:
                raise serializers.ValidationError(
                    {"department_id": "A manager assignment requires a department_id."}
                )
            try:
                attrs["department"] = Department.objects.get(pk=department_id)
            except Department.DoesNotExist:
                raise serializers.ValidationError(
                    {"department_id": "Department not found."}
                )

        elif role in ("admin", "user"):
            pass  # no scope required

        # Trades are technician-only, and must belong to the assigned section's type.
        sub_section_ids = attrs.get("sub_section_ids") or []
        if sub_section_ids and role != "technician":
            raise serializers.ValidationError(
                {"sub_section_ids": "Only technician assignments carry sub-sections."}
            )
        if role == "technician":
            if not sub_section_ids:
                raise serializers.ValidationError(
                    {
                        "sub_section_ids": "A technician assignment requires at least "
                        "one sub-section, or they would see no tickets."
                    }
                )
            section = attrs["section"]
            found = SubSection.objects.filter(
                pk__in=sub_section_ids, section_type_id=section.section_type_id
            )
            if found.count() != len(set(sub_section_ids)):
                raise serializers.ValidationError(
                    {
                        "sub_section_ids": "Every sub-section must belong to the "
                        "section's section_type."
                    }
                )
            attrs["sub_sections"] = list(found)

        return attrs


# ── User admin serializers ────────────────────────────────────────────────────


def _primary_ra(user_obj):
    """Return the user's RoleAssignment, or None.

    Comes free off `select_related("role_assignment__…")` in the list view.
    """
    try:
        return user_obj.role_assignment
    except RoleAssignment.DoesNotExist:
        return None


class UserAdminSerializer(serializers.ModelSerializer):
    """Read serializer for the admin user list — matches the frontend User interface."""

    role = serializers.SerializerMethodField()
    campus_name = serializers.SerializerMethodField()
    sections = serializers.SerializerMethodField()
    section_names = serializers.SerializerMethodField()
    primary_campus_id = serializers.SerializerMethodField()
    primary_campus_display = serializers.SerializerMethodField()
    primary_department_id = serializers.SerializerMethodField()
    primary_department_display = serializers.SerializerMethodField()
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
            "email",
            "date_joined",
            "role",
            "campus_name",
            "sections",
            "section_names",
            "primary_campus_id",
            "primary_campus_display",
            "primary_department_id",
            "primary_department_display",
            "primary_department_name",
            "home_campus_id",
            "home_campus_name",
        ]

    def get_role(self, obj):
        ra = _primary_ra(obj)
        return ra.role if ra else "user"

    def get_home_campus_id(self, obj):
        campus = home_campus_from_user(obj)
        return campus.pk if campus else None

    def get_home_campus_name(self, obj):
        campus = home_campus_from_user(obj)
        return campus.name if campus else None

    def get_campus_name(self, obj):
        ra = _primary_ra(obj)
        c = campus_from_role_assignment(ra)
        return c.name if c else None

    def get_sections(self, obj):
        ra = _primary_ra(obj)
        if ra and ra.section_id:
            return [ra.section_id]
        return []

    def get_section_names(self, obj):
        ra = _primary_ra(obj)
        if ra and ra.section_id and ra.section:
            return [str(ra.section)]
        return []

    def get_primary_campus_id(self, obj):
        ra = _primary_ra(obj)
        c = campus_from_role_assignment(ra)
        return c.pk if c else None

    def get_primary_campus_display(self, obj):
        ra = _primary_ra(obj)
        c = campus_from_role_assignment(ra)
        return c.name if c else None

    def get_primary_department_id(self, obj):
        ra = _primary_ra(obj)
        d = department_from_role_assignment(ra)
        return d.pk if d else None

    def get_primary_department_display(self, obj):
        ra = _primary_ra(obj)
        d = department_from_role_assignment(ra)
        return d.name if d else None

    def get_primary_department_name(self, obj):
        return self.get_primary_department_display(obj)


class UserCreateSerializer(serializers.Serializer):
    """Write serializer for admin user creation.

    Username and name are derived from the email (`identity_from_email`) and
    cannot be supplied: an override here would be a second answer to who this
    person is, which is exactly what deriving from the address removes. Admin
    creation and self-registration therefore produce identical accounts.
    """

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    campus_id = serializers.IntegerField()

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_campus_id(self, value):
        from apps.org.models import Campus

        if not Campus.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Campus not found.")
        return value

    def create(self, validated_data):
        from apps.accounts.identity import identity_from_email

        username, first, last = identity_from_email(validated_data["email"])

        user = User.objects.create_user(
            username=username,
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=first,
            last_name=last,
        )
        RoleAssignment.objects.create(user=user, role="user")
        UserProfile.objects.create(user=user, campus_id=validated_data["campus_id"])
        return user


class UserUpdateSerializer(serializers.Serializer):
    """Write serializer for admin user update.

    Name and username are not editable — they follow the email. Changing the
    address re-derives all three, so someone who moves from
    `j.mwangi@ksg.ac.ke` to `jeremy.mwangi@ksg.ac.ke` is renamed with it rather
    than left displaying a name their address no longer supports.
    """

    email = serializers.EmailField(required=False)
    campus_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_email(self, value):
        # Case-insensitive: the email is the login credential now, so two
        # accounts differing only in case would be two ways to sign in as
        # different people.
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_campus_id(self, value):
        from apps.org.models import Campus

        if value is not None and not Campus.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Campus not found.")
        return value

    def update(self, instance, validated_data):
        from apps.accounts.identity import identity_from_email

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
