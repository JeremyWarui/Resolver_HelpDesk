"""Which role the caller holds, and what that role is allowed to do.

The role tiers below and `resolve_role` are the single answer to "who is this
request"; the two permission classes are the DRF wrappers around it.

Used by:
    accounts.views       IsAdminGroup
    org.views            IsAdminGroup, IsAdminOrReadOnly, resolve_role
    sla.views            IsAdminGroup
    facilities.views     IsAdminOrReadOnly
    tickets.views        STAFF_ROLES, TICKET_SUPERVISOR_ROLES, resolve_role
    analytics.views      ANALYTICS_ROLES, resolve_role
    analytics.report_views  resolve_role
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

# Roles that may act on someone else's ticket: assign it, change its status,
# delete an attachment they did not upload.
#
# `manager` is deliberately absent. A manager oversees all five campuses and
# has estate-wide read scope, but never touches ticket lifecycle: the work is
# held and moved by the HOS who staffs it. Adding them here would make every
# campus's queue editable by one person with no trade knowledge of it.
TICKET_SUPERVISOR_ROLES = ("admin", "hod", "hos")

# Oversight without ticket authority, which is the manager's whole remit.
OVERSIGHT_ROLES = ("manager",)

# Who may read the supervising analytics endpoints: anyone who oversees other
# people's work, at any level. A technician is absent, and `role_config` also
# refuses them `technician` as a group_by, so they are never ranked against
# peers by either route.
ANALYTICS_ROLES = TICKET_SUPERVISOR_ROLES + OVERSIGHT_ROLES

# Everyone who works tickets, as opposed to raising them. Staff actions
# (assign, claim, change status) are gated on this. `user` is absent even
# though a requester can see their own ticket, and so is `manager`, for the
# reason given on TICKET_SUPERVISOR_ROLES.
STAFF_ROLES = TICKET_SUPERVISOR_ROLES + ("technician",)


def resolve_role(request):
    """Return the caller's role string, or None.

    The JWT claim is authoritative for a request. The database fallback is for
    requests authenticated without a token, which is what `force_authenticate`
    produces in tests.
    """
    try:
        auth = getattr(request, "auth", None)
        role = auth.get("role") if auth else None
        if role:
            return role
    except Exception:
        pass

    user = getattr(request, "user", None)
    return getattr(user, "role", None) if user else None


class IsAdminGroup(BasePermission):
    """Allow only callers whose role is 'admin'. Gates the config endpoints."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and resolve_role(request) == "admin"
        )


class IsAdminOrReadOnly(BasePermission):
    """Read for any authenticated caller, write for admin only.

    Used on the reference-data viewsets the requester UI has to read, such as
    the catalogue tree and the department list.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return resolve_role(request) == "admin"
