from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models


class CustomUser(AbstractUser):
    """User model. Role is derived from the RoleAssignment — not stored here."""

    phone_number = models.CharField(max_length=15, blank=True)

    class Meta:
        app_label = "accounts"
        ordering = ["username"]

    def __str__(self):
        return self.username

    @property
    def role(self):
        try:
            return self.role_assignment.role  # type: ignore[attr-defined]
        except RoleAssignment.DoesNotExist:
            return None


class UserProfile(models.Model):
    """One-to-one extension of CustomUser carrying campus placement."""

    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    campus = models.ForeignKey(
        "org.Campus",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )

    class Meta:
        app_label = "accounts"

    def __str__(self):
        campus_code = self.campus.code if self.campus else "NO-CAMPUS"
        return f"{self.user.username} @ {campus_code}"


# The scope FK each role carries: exactly the one named here, or none at all
# where the value is None. clean() enforces it on every save.
SCOPE_FIELD_BY_ROLE = {
    "technician": "section",
    "hos": "section",
    "hod": "campus_department",
    "manager": "department",
    "admin": None,
    "user": None,
}

# Every scope FK on the model, for the walks in clean() and __str__.
SCOPE_FIELDS = (
    "section",
    "campus_department",
    "department",
)


class RoleAssignment(models.Model):
    """Maps a user to their one role, with an explicit organisational scope.

    One row per user. Role cover is deliberately absent: absence is handled
    organisationally, not in software, so there are no validity windows, no
    primary/secondary distinction and no role switching. Only an admin creates
    or changes these rows.

    Which scope each role carries is declared in SCOPE_FIELD_BY_ROLE above and
    enforced by clean(), which save() runs on every write.
    """

    ROLE_CHOICES = [
        ("user", "User"),
        ("technician", "Technician"),
        ("hos", "HOS"),
        ("hod", "HOD"),
        ("manager", "Manager"),
        ("admin", "Admin"),
    ]

    user = models.OneToOneField(
        "accounts.CustomUser",
        on_delete=models.CASCADE,
        related_name="role_assignment",
    )
    role = models.CharField(max_length=12, choices=ROLE_CHOICES)

    # Scope FKs — nullable; which one is set depends on the role.
    section = models.ForeignKey(
        "org.Section",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="+",
    )
    campus_department = models.ForeignKey(
        "org.CampusDepartment",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="+",
    )
    department = models.ForeignKey(
        "org.Department",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="+",
    )

    assigned_by = models.ForeignKey(
        "accounts.CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="given_role_assignments",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "accounts"

    def clean(self):
        """Reject an assignment whose scope does not match its role.

        The role's rule in SCOPE_FIELD_BY_ROLE names the one scope FK it must
        carry; every other scope FK must be null. Errors are keyed by field
        name so a form or serializer shows each one beside its own input.
        """
        if self.role not in SCOPE_FIELD_BY_ROLE:
            # Unknown role: clean_fields() has already recorded the choices
            # error, and there is no rule here to check it against.
            return

        required = SCOPE_FIELD_BY_ROLE[self.role]
        errors = {}
        for field in SCOPE_FIELDS:
            present = bool(getattr(self, f"{field}_id"))
            if field == required and not present:
                errors[field] = f"A {self.role} assignment requires a {field}."
            elif field != required and present:
                errors[field] = f"A {self.role} assignment must not carry a {field}."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        """Run clean() and the field checks on every write, whatever the caller.

        validate_unique=False skips the uniqueness query: the OneToOne on
        `user` already enforces one role per user in the database.
        """
        self.full_clean(validate_unique=False)
        super().save(*args, **kwargs)

    def __str__(self):
        # "<user id> / <role>", then whichever scope FKs are set:
        # "7 / hos > section=3". Shown in admin FK dropdowns.
        scope = [
            f"{field}={getattr(self, f'{field}_id')}"
            for field in SCOPE_FIELDS
            if getattr(self, f"{field}_id")
        ]
        return f"{self.user_id} / {' > '.join([self.role, *scope])}"
