"""
The single writer of who holds which post.

Writing the row is granting the access: `accounts.scope` reads the same row
back, so there is no second copy to keep in step.
"""

from django.db import transaction

from apps.accounts.models import RoleAssignment, TechnicianTrade
from apps.accounts.scope import SCOPE_FIELD_BY_ROLE

# One person per supervisor post at a campus, so filling one displaces whoever
# held it. `manager` is here too: one organisation, one manager.
SINGLE_HOLDER_ROLES = ("hos", "hod", "manager")


def ensure_requester(user):
    """Guarantee a RoleAssignment exists, defaulting to `user`."""
    return RoleAssignment.objects.get_or_create(user=user, defaults={"role": "user"})[0]


@transaction.atomic
def assign_role(target, role, *, campus=None, sub_sections=(), actor=None):
    """Give a user a post, and report whoever it displaced.

    Returns `(role_assignment, displaced)` — the person this took a supervisor
    post off, or None. The caller reports them: an admin should not have to
    infer a demotion from a screen that stops mentioning someone.

    `campus` is a model, not an id: resolving an id is validation, and belongs
    to the serializer that took it from a client.
    """
    displaced = _displace_incumbent(target, role, campus, actor)

    # Replaced, not updated, so assigned_by/assigned_at record *this* change.
    RoleAssignment.objects.filter(user=target).delete()
    assignment = RoleAssignment.objects.create(
        user=target, role=role, campus=campus, assigned_by=actor
    )

    # A technician moving campus must not keep the old campus's trades.
    TechnicianTrade.objects.filter(user=target).delete()
    if role == "technician":
        for sub_section in sub_sections:
            TechnicianTrade.objects.create(
                user=target, campus=campus, sub_section=sub_section
            )

    return assignment, displaced


def add_trade(user, campus, sub_section):
    """Give a technician one more (campus, trade) pair."""
    # The role row's campus is a single FK and cannot hold two pairs.
    link, _ = TechnicianTrade.objects.get_or_create(
        user=user, campus=campus, sub_section=sub_section
    )
    return link


def _displace_incumbent(target, role, campus, actor):
    """Demote whoever already holds this supervisor post, and return them."""
    if role not in SINGLE_HOLDER_ROLES:
        return None

    scope = {"campus": campus} if SCOPE_FIELD_BY_ROLE[role] == "campus" else {}
    if SCOPE_FIELD_BY_ROLE[role] == "campus" and campus is None:
        return None

    incumbent = (
        RoleAssignment.objects.select_related("user")
        .filter(role=role, **scope)
        .exclude(user=target)
        .first()
    )
    if incumbent is None:
        return None

    # Demoted, not deleted, so every user still has exactly one RoleAssignment.
    user = incumbent.user
    incumbent.delete()
    RoleAssignment.objects.create(user=user, role="user", assigned_by=actor)
    return user


def scope_kwargs_from_ids(role, *, campus_id=None):
    """Resolve a client-supplied campus id to the scope a role requires.

    Raises `LookupError` carrying a field name and a message the caller
    renders as a validation error.
    """
    from apps.org.models import Campus

    if SCOPE_FIELD_BY_ROLE.get(role) != "campus":
        return {}

    if not campus_id:
        raise LookupError(("campus_id", f"A {role} assignment requires a campus."))
    campus = Campus.objects.filter(pk=campus_id).first()
    if campus is None:
        raise LookupError(("campus_id", "Campus not found."))
    return {"campus": campus}
