"""The account, its campus placement, and the one role it holds.

Contents:
    CustomUser       purpose: the login. Adds a phone number; the role is not
                     stored here, it is derived from the RoleAssignment.
    CustomUser.role  purpose: the one role held, or None. Why: convenience only —
                     gate access through `common.roles.resolve_role`, which
                     prefers the JWT claim and falls back to this.
    UserProfile      purpose: campus placement. Why: where a person works is what
                     routes the tickets they raise, and is not their role's scope.
    RoleAssignment   purpose: one row per user mapping them to their role and the
                     org object that role is scoped to.
      .clean()       purpose: reject a scope that does not match the role.
      .save()        purpose: run clean() on every write, whatever the caller.
      .__str__()     purpose: "<user id> / <role> > <scope>" for admin dropdowns.

Used by:
    accounts.posts                   RoleAssignment
    accounts.scope                   RoleAssignment
    accounts.serializers             RoleAssignment, UserProfile
    accounts.views                   RoleAssignment
    common.admin                     CustomUser, UserProfile, RoleAssignment
    common.management.commands.seed  UserProfile
    notifications.notify             RoleAssignment
"""

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models

# Imported, not restated: clean() here and the write serializer read the same
# dict, so neither can drift from the other.
from apps.accounts.scope import SCOPE_FIELD_BY_ROLE, SCOPE_FIELDS, role_of


class CustomUser(AbstractUser):
    """The login. Role is derived from the RoleAssignment, not stored here."""

    phone_number = models.CharField(max_length=15, blank=True)

    class Meta:
        app_label = "accounts"
        ordering = ["username"]

    def __str__(self):
        return self.username

    @property
    def role(self):
        return role_of(self)


class UserProfile(models.Model):
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
    """A user's one role, with the org object it is scoped to.

    One row per user, held for as long as they hold the post. Which scope each
    role carries is declared in `accounts.scope.SCOPE_FIELD_BY_ROLE`. Only
    `accounts.posts.assign_role` writes these rows: the org FKs that
    `accounts.scope` reads have to move in step with this one.
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
        """The role's rule names the one scope FK it must carry; every other must
        be null. Errors are keyed by field name so a form or serializer shows
        each one beside its own input.
        """
        if self.role not in SCOPE_FIELD_BY_ROLE:
            # Unknown role: clean_fields() already recorded the choices error.
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
        """validate_unique=False skips the uniqueness query: the OneToOne on `user`
        already enforces one role per user in the database.
        """
        self.full_clean(validate_unique=False)
        super().save(*args, **kwargs)

    def __str__(self):
        scope = [
            f"{field}={getattr(self, f'{field}_id')}"
            for field in SCOPE_FIELDS
            if getattr(self, f"{field}_id")
        ]
        return f"{self.user_id} / {' > '.join([self.role, *scope])}"
