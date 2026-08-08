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
        """Derived accessor — reads the user's single RoleAssignment."""
        try:
            return self.role_assignment.role
        except RoleAssignment.DoesNotExist:
            return None

    @property
    def campus(self):
        """Convenience: the user's home campus from their UserProfile."""
        try:
            return self.profile.campus
        except UserProfile.DoesNotExist:
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


class RoleAssignment(models.Model):
    """Maps a user to their one role, with an explicit organisational scope.

    One row per user. Role cover is deliberately absent: absence is handled
    organisationally, not in software, so there are no validity windows, no
    primary/secondary distinction and no role switching. Only an admin creates
    or changes these rows.

    Scope constraints per role (enforced in clean(), not DB CheckConstraints):
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
        """Per-role scope rules — one readable, testable place."""
        if self.role in ("technician", "hos"):
            if not self.section_id:
                raise ValidationError(
                    {"section": f"A {self.role} assignment requires a section."}
                )
        elif self.role == "hod":
            if not self.campus_department_id:
                raise ValidationError(
                    {
                        "campus_department": "An HOD assignment requires a campus_department."
                    }
                )
        elif self.role == "manager":
            if not self.department_id:
                raise ValidationError(
                    {"department": "A manager assignment requires a department."}
                )
        elif self.role in ("admin", "user"):
            # No organisational scope — all three must be null.
            if self.section_id or self.campus_department_id or self.department_id:
                raise ValidationError(
                    f"A {self.role} assignment must have no scope "
                    "(section, campus_department, department all null)."
                )

    def __str__(self):
        parts = [self.role]
        if self.section_id:
            parts.append(f"section={self.section_id}")
        if self.campus_department_id:
            parts.append(f"cd={self.campus_department_id}")
        if self.department_id:
            parts.append(f"dept={self.department_id}")
        return f"{self.user_id} / {' > '.join(parts)}"
