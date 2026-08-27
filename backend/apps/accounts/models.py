"""
The account, its campus placement, and the posts it holds.

A role is a RoleAssignment row, one per person, not a column on the user.
Posts point into `org`, never the other way round.
"""

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models

from apps.accounts.scope import SCOPE_FIELD_BY_ROLE, role_of


class CustomUser(AbstractUser):
    """The login: a phone number, and where the person works.

    `campus` is where they are based, which routes the tickets they raise. It
    is not what their role oversees — that is the RoleAssignment's scope, and a
    manager's two answers differ.
    """

    phone_number = models.CharField(max_length=15, blank=True)
    campus = models.ForeignKey(
        "org.Campus",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )

    class Meta:
        app_label = "accounts"
        ordering = ["username"]

    def __str__(self):
        return self.username

    @property
    def role(self):
        """Return the one role this user holds, or None."""
        # Admin and shell convenience. Gate access through `roles.resolve_role`.
        return role_of(self)


class RoleAssignment(models.Model):
    """A user's one role, and the campus it is scoped to.

    One row per user, held for as long as they hold the post. Which roles carry
    a campus is declared in `accounts.scope.SCOPE_FIELD_BY_ROLE`; an admin and
    a manager carry none because they see every campus.
    """

    # Only `accounts.posts.assign_role` writes these rows, and the trade links with them.
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
    campus = models.ForeignKey(
        "org.Campus",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="role_assignments",
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
        """Reject a scope that does not match the role.

        A campus-scoped role must name one; every other role must not, or an
        admin would appear to belong to a single campus.
        """
        if self.role not in SCOPE_FIELD_BY_ROLE:
            # clean_fields() already recorded the choices error.
            return

        needs_campus = SCOPE_FIELD_BY_ROLE[self.role] == "campus"
        if needs_campus and not self.campus_id:
            raise ValidationError(
                {"campus": f"A {self.role} assignment requires a campus."}
            )
        if not needs_campus and self.campus_id:
            raise ValidationError(
                {"campus": f"A {self.role} assignment must not carry a campus."}
            )

    def save(self, *args, **kwargs):
        """Validate on every write, whatever the caller."""
        # The OneToOne on `user` already enforces one role per user.
        self.full_clean(validate_unique=False)
        super().save(*args, **kwargs)

    def __str__(self):
        """Return "<user id> / <role> > <campus>", for admin dropdowns."""
        scope = f" > campus={self.campus_id}" if self.campus_id else ""
        return f"{self.user_id} / {self.role}{scope}"


class TechnicianTrade(models.Model):
    """Links a technician to one trade at one campus.

    One row is one (campus, trade) pair. A technician's scope is the set of
    those pairs, never the cross product of the campuses and trades they appear
    in: someone who is Carpentry@Nairobi and Plumbing@Mombasa must not thereby
    reach Plumbing@Nairobi.
    """

    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="technician_trades",
    )
    campus = models.ForeignKey(
        "org.Campus",
        on_delete=models.CASCADE,
        related_name="technician_trades",
    )
    sub_section = models.ForeignKey(
        "org.SubSection",
        on_delete=models.CASCADE,
        related_name="technician_trades",
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "accounts"
        ordering = ["campus", "sub_section", "user"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "campus", "sub_section"],
                name="unique_technician_campus_sub_section",
            )
        ]
        indexes = [
            models.Index(
                fields=["campus", "sub_section"],
                name="techtrade_campus_sub_idx",
            ),
        ]

    def __str__(self):
        return f"{self.user.username} → {self.campus.code}/{self.sub_section.code}"
