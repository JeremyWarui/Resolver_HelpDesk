from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.common.roles import resolve_role


class IsAdminGroup(BasePermission):
    """Grants access only to users whose active role is 'admin' (via JWT claim).
    Gates all §5.2 admin configuration endpoints."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and resolve_role(request) == "admin"
        )


class IsAdminOrReadOnly(BasePermission):
    """Safe (read) methods allowed for any authenticated user; write methods
    restricted to admin role.  Used on reference-data viewsets that the
    requester UI needs to read (catalogue tree, department list, etc.)."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return resolve_role(request) == "admin"
