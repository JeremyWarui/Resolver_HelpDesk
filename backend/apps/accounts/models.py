"""
The account, its campus placement, and the post it holds.

A role is a RoleAssignment row, one per person, not a column on the user.
Posts point into `org`, never the other way round.
"""

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models

# Each role, its label, and the one scope column it carries. A None scope means
# the role has no campus of its own: an admin and a manager see every campus,
# and a plain user is reached through the tickets they raised, not through a
# post. This is the only place the six roles are listed.
ROLES = {
    "user": ("User", None),
    "technician": ("Technician", "campus"),
    "hos": ("HOS", "campus"),
    "hod": ("HOD", "campus"),
    "manager": ("Manager", None),
    "admin": ("Admin", None),
}

ROLE_CHOICES = [(role, label) for role, (label, _) in ROLES.items()]
SCOPE_FIELD_BY_ROLE = {role: field for role, (_, field) in ROLES.items()}


class CustomUser(AbstractUser):
    """The login, and where the person works.

    `campus` is where they are based, which routes the tickets they raise. It
    is not what their role oversees — that is `role_campus`, and a manager's
    two answers differ.
    """

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
    def assignment(self):
        # Reads the reverse OneToOne, so a select_related("role_assignment")
        # upstream still costs no extra query.
        try:
            return self.role_assignment
        except RoleAssignment.DoesNotExist:
            return None

    @property
    def role(self):
        # Admin and shell convenience, and the fallback `common.roles.resolve_role`
        # uses for requests with no token. Gate access through resolve_role.
        assignment = self.assignment
        return assignment.role if assignment else None

    @property
    def role_campus(self):
        """The campus this role covers. None means every campus, not none."""
        assignment = self.assignment
        return assignment.campus if assignment else None


class RoleAssignment(models.Model):
    """A user's one role, and the campus it is scoped to.

    One row per user, held for as long as they hold the post. Which roles carry
    a campus is declared in `ROLES` above; an admin and a manager carry none
    because they see every campus. A technician's trades are not here: they are
    TechnicianTrade rows, because one FK cannot hold two pairs.

    Only `accounts.posts.assign_role` writes these rows, and the trade links
    with them.
    """

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
    trade = models.ForeignKey(
        "org.Trade",
        on_delete=models.CASCADE,
        related_name="technician_trades",
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "accounts"
        ordering = ["campus", "trade", "user"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "campus", "trade"],
                name="unique_technician_campus_trade",
            )
        ]
        indexes = [
            models.Index(
                fields=["campus", "trade"],
                name="techtrade_campus_trade_idx",
            ),
        ]

    def __str__(self):
        return f"{self.user.username} → {self.campus.code}/{self.trade.code}"
