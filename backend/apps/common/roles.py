"""Which role the caller holds, and what that role is allowed to do.

Reporting is not gated by a role set: every role reads the same figures over
its own scope, and `scoped_ticket_qs` is what narrows them.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

# May act on someone else's ticket. `manager` is absent: read scope, never
# lifecycle.
TICKET_SUPERVISOR_ROLES = ("admin", "hod", "hos")

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
