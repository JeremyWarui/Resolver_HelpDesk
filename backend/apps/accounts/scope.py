"""
What each role may reach.

Scope is derived here, never taken from a client parameter, and an unknown
role reaches nothing. Every scoped role is scoped to a campus: a technician to
the trades they hold at one, an HOS and an HOD to the whole of one. Model
imports are function-local, because `accounts.models` imports these
declarations and a module-level import would close a cycle.
"""

from django.db.models import Exists, OuterRef

# The one scope field a role carries. None means the role is not campus-scoped:
# admin and manager see every campus, a plain user only their own tickets.
SCOPE_FIELD_BY_ROLE = {
    "technician": "campus",
    "hos": "campus",
    "hod": "campus",
    "manager": None,
    "admin": None,
    "user": None,
}

CAMPUS_SCOPED_ROLES = ("technician", "hos", "hod")

# Sees every campus, so no scope row is needed to prove it.
UNSCOPED_ROLES = ("admin", "manager")


def role_holds_campus(user, role, prefix="campus_id"):
    """Return an Exists() matching the campus `user` holds under `role`.

    `prefix` is the path to the campus id on the model being filtered:
    "requester_campus_id" for a Ticket, "id" for a Campus.
    """
    from apps.accounts.models import RoleAssignment

    return Exists(
        RoleAssignment.objects.filter(
            user=user, role=role, campus_id=OuterRef(prefix)
        )
    )


def technician_pair_exists(
    user, campus_field="requester_campus_id", sub_section_field="sub_section_id"
):
    """Return an Exists() matching a technician's (campus, trade) pairs."""
    # Pairwise, never the cross product: two `__in` lookups would also match
    # Carpentry@Nairobi + Plumbing@Mombasa against pairs nobody assigned.
    from apps.accounts.models import TechnicianTrade

    return Exists(
        TechnicianTrade.objects.filter(
            user=user,
            campus_id=OuterRef(campus_field),
            sub_section_id=OuterRef(sub_section_field),
        )
    )


def visible_campuses(user, role):
    """Return the campuses a user may act in, or none if the role is unknown."""
    from apps.accounts.models import TechnicianTrade
    from apps.org.models import Campus

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


def campus_for(role_assignment):
    """Return the campus a role assignment is scoped to, or None."""
    ra = role_assignment
    return ra.campus if ra is not None and ra.campus_id else None


def home_campus(user):
    """Return where the person works, not what their role oversees."""
    # Routes a ticket they raise, so a manager gets one campus, not all of them.
    return user.campus if user and user.campus_id else None


def assignment_of(user):
    """Return the user's RoleAssignment, or None."""
    from apps.accounts.models import RoleAssignment

    try:
        return user.role_assignment
    except (RoleAssignment.DoesNotExist, AttributeError):
        return None


def role_of(user):
    """Return the user's role string, or None."""
    assignment = assignment_of(user)
    return assignment.role if assignment else None


def post_holder(role, **scope):
    """Return the user holding `role` at the given scope, or None.

    The one way to ask "who is the HOS of this campus": the role row is the
    only record of a post, so nothing else has to be kept in step with it.
    """
    from apps.accounts.models import RoleAssignment

    if any(value is None for value in scope.values()):
        return None
    assignment = (
        RoleAssignment.objects.filter(role=role, **scope).select_related("user").first()
    )
    return assignment.user if assignment else None
