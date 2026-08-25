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


# The per-role scope invariant, declared once as data so `clean()` reads it
# rather than restating it. Each role carries exactly the one scope FK named
# here, or none at all where the value is None.
#
# `RoleAssignmentCreateSerializer.validate()` still writes this rule out a
# second time in an if/elif ladder. It should be driven from here instead —
# until it is, a role added below needs editing in two places.
SCOPE_FIELD_BY_ROLE = {
    "technician": "section",
    "hos": "section",
    "hod": "campus_department",
    "manager": "department",
    "admin": None,
    "user": None,
}

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

    Scope constraints per role are declared once in SCOPE_FIELD_BY_ROLE and
    enforced by clean(), which save() runs on every write:
        technician / hos → section required
        hod            → campus_department required
        manager        → department required
        admin / user   → no scope (all three must be null)
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
        """Per-role scope rules — one readable, testable place.

        A role carries exactly the scope its rule names and nothing else. Both
        halves matter and they fail differently. The missing half leaves a
        technician with a role and no reach: `scoped_ticket_qs` matches on the
        pair, finds none, and shows them an empty queue with no error anywhere.
        The extra half leaves a row claiming two remits, where
        `campus_from_role_assignment` and `_department_id_for_assignment` answer
        "what does this person cover" from different columns and the JWT carries
        both — an HOD who is also scoped department-wide reads every campus, and
        nothing in the request looks wrong.
        """
        if self.role not in SCOPE_FIELD_BY_ROLE:
            # `clean_fields()` has already recorded the choices error for an
            # unknown role. Looking it up here would raise KeyError — a 500 —
            # on top of the validation message the caller should be getting.
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
        #  Validate_unique=False: the OneToOne on `user` already enforces
        # one-role-per-user at the DB. We want clean() + field/choices checks
        # not redundant uniqueness query that would turn DB's integrityError into ValidationError
        self.full_clean(validate_unique=False)
        super().save(*args, **kwargs)

    def __str__(self):
        parts = [self.role]
        if self.section_id:
            parts.append(f"section={self.section_id}")
        if self.campus_department_id:
            parts.append(f"cd={self.campus_department_id}")
        if self.department_id:
            parts.append(f"dept={self.department_id}")
        return f"{self.user_id} / {' > '.join(parts)}"
