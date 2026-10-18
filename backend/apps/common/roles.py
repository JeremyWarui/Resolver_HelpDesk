"""Which role the caller holds, and what that role is allowed to do.

Reporting is not gated by a role set: every role reads the same figures over
its own scope, and `reporting_ticket_qs` is what narrows them.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

# May act on someone else's ticket: assign, set priority, move status, delete
# another person's attachment. A technician works a ticket but does not
# decide who holds it.
TICKET_SUPERVISOR_ROLES = ("admin", "hod", "hos")


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


class IsAdminOrManagerReadOnly(BasePermission):
    """Read for the admin and the manager, write for the admin only.

    The registers the whole organisation is read from: campuses and who heads
    them.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        role = resolve_role(request)
        if request.method in SAFE_METHODS:
            return role in ("admin", "manager")
        return role == "admin"


class IsAdminOrReadOnly(BasePermission):
    """Read for any authenticated caller, write for admin only.

    Used on the reference data the requester UI has to read: trades, service
    items, facilities and priorities.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return resolve_role(request) == "admin"
