"""
The single writer of who holds which post.

Writing the row is granting the access: `accounts.scope` reads the same row
back, so there is no second copy to keep in step.
"""

from django.db import IntegrityError, transaction

from apps.accounts.models import CAMPUS_ROLES, RoleAssignment, TechnicianTrade

# One person per supervisor post at a campus, so filling one displaces whoever
# held it. `manager` is here too: one organisation, one manager.
SINGLE_HOLDER_ROLES = ("hos", "hod", "manager")


def ensure_requester(user):
    """Every user holds exactly one role, so a new account needs this one."""
    return RoleAssignment.objects.get_or_create(user=user, defaults={"role": "user"})[0]


@transaction.atomic
def assign_role(target, role, *, campus=None, trades=(), actor=None):
    """Give a user a post, and report whoever it displaced.

    Returns `(role_assignment, displaced)`. The caller reports the displaced
    person: an admin should not have to infer a demotion from a screen that
    stops mentioning someone.

    `campus` is a model, not an id. Resolving an id is validation, and belongs
    to the serializer that took it from a client. Raises `PostRefused` when a
    deactivated account would take a post from someone else.
    """
    current = RoleAssignment.objects.filter(user=target).first()
    if current is not None and _unchanged(current, target, role, campus, trades):
        return current, None

    if not target.is_active and _holder(target, role, campus) is not None:
        raise PostRefused(
            "This account is deactivated, so the post would be left with nobody "
            "in it. Restore the account first."
        )
    displaced = _displace_incumbent(target, role, campus, actor)

    # Replaced, not updated, so assigned_by/assigned_at record *this* change.
    RoleAssignment.objects.filter(user=target).delete()
    try:
        with transaction.atomic():
            assignment = RoleAssignment.objects.create(
                user=target, role=role, campus=campus, assigned_by=actor
            )
    except IntegrityError:
        # Another admin filled the same post between the read above and now.
        raise PostRefused(
            "Someone else was given this post a moment ago. Reload and try again."
        ) from None

    # A technician moving campus must not keep the old campus's trades.
    TechnicianTrade.objects.filter(user=target).delete()
    if role == "technician":
        for trade in trades:
            TechnicianTrade.objects.create(user=target, campus=campus, trade=trade)

    return assignment, displaced


class PostRefused(ValueError):
    """A role write that would empty a post rather than fill it."""


def _unchanged(current, target, role, campus, trades):
    """Whether the user already holds exactly this post, with exactly these trades."""
    if current.role != role or current.campus_id != (campus.pk if campus else None):
        return False
    held = set(TechnicianTrade.objects.filter(user=target).values_list("campus_id", "trade_id"))
    wanted = {(campus.pk, t.pk) for t in trades} if role == "technician" else set()
    return held == wanted


def _holder(target, role, campus):
    """Whoever other than `target` holds this single-holder post, as their RoleAssignment."""
    if role not in SINGLE_HOLDER_ROLES:
        return None
    if role in CAMPUS_ROLES and campus is None:
        return None
    scope = {"campus": campus} if role in CAMPUS_ROLES else {}
    return (
        RoleAssignment.objects.select_related("user")
        .filter(role=role, **scope)
        .exclude(user=target)
        .first()
    )


def _displace_incumbent(target, role, campus, actor):
    """Demote whoever already holds this supervisor post, and return them."""
    incumbent = _holder(target, role, campus)
    if incumbent is None:
        return None

    # Demoted, not deleted, so every user still has exactly one RoleAssignment.
    user = incumbent.user
    incumbent.delete()
    RoleAssignment.objects.create(user=user, role="user", assigned_by=actor)
    return user
