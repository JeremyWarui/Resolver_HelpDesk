"""
What each role may reach.

Scope is derived here, never taken from a client parameter, and an unknown
role reaches nothing. Every scoped role is scoped to a campus: a technician to
the trades they hold at one, an HOS and an HOD to the whole of one.
"""

from django.db.models import Exists, OuterRef

from apps.accounts.models import RoleAssignment, TechnicianTrade
from apps.org.models import Campus

# Sees every campus, so no scope row is needed to prove it. Not the same set as
# the roles carrying a null scope in `models.ROLES`: a plain user's scope is
# also null, and they see no campus roster at all.
UNSCOPED_ROLES = ("admin", "manager")


def role_holds_campus(user, role, prefix):
    """`prefix` is the path to the campus id on the model being filtered:
    "requester_campus_id" for a Ticket, "id" for a Campus. No default, because
    the two callers filter different models and neither name would suit both.
    """
    return Exists(
        RoleAssignment.objects.filter(user=user, role=role, campus_id=OuterRef(prefix))
    )


def visible_campuses(user, role):
    """Return the campuses a user may act in, or none if the role is unknown."""
    base = Campus.objects.all()

    if role in UNSCOPED_ROLES:
        return base

    if role == "technician":
        # Campus-granular: the trade narrowing happens on tickets.
        return base.filter(
            pk__in=TechnicianTrade.objects.filter(user=user).values_list(
                "campus_id", flat=True
            )
        )

    if role in ("hos", "hod"):
        return base.filter(role_holds_campus(user, role, prefix="id"))

    # Fail closed: an unknown role, and a plain requester, see no campus roster.
    return base.none()


def post_holder(role, **scope):
    """The one way to ask "who is the HOS of this campus".

    The role row is the only record of a post, so nothing else has to be kept
    in step with it.
    """
    if any(value is None for value in scope.values()):
        return None
    # A deactivated holder holds nothing: their post reads as vacant.
    assignment = (
        RoleAssignment.objects.filter(role=role, user__is_active=True, **scope)
        .select_related("user")
        .first()
    )
    return assignment.user if assignment else None
