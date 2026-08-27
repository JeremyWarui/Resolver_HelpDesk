"""
Auth and user-management endpoints, and the token claims they issue.

Every claim is re-read from the database at issue time rather than copied from
the token being replaced, so a role change lands on the next silent refresh.
"""

import logging

from django.contrib.auth import authenticate, get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.identity import display_name
from apps.accounts.models import RoleAssignment
from apps.accounts.scope import home_campus
from apps.accounts.serializers import (
    RoleAssignmentSerializer,
    RoleAssignmentWriteSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
)
from apps.common.pagination import ConfigListPagination
from apps.common.roles import IsAdminGroup

_logger = logging.getLogger(__name__)
User = get_user_model()

REFRESH_COOKIE = "resolver_refresh"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60


def get_assignment(user):
    """Return the user's RoleAssignment with its whole scope graph, or None."""
    # Exactly what RoleAssignmentSerializer walks, so serializing costs no queries.
    return (
        RoleAssignment.objects.filter(user=user)
        .select_related("campus", "assigned_by")
        .first()
    )


def build_tokens_for_assignment(user, role_assignment):
    """Return a (refresh, access) pair carrying the scope claims."""
    refresh = RefreshToken.for_user(user)

    # Their *home* campus, not what their role oversees.
    campus = home_campus(user)

    claims = {
        "email": user.email,
        "role": role_assignment.role if role_assignment else None,
        "campus_id": campus.pk if campus else None,
        "scope_campus_id": role_assignment.campus_id if role_assignment else None,
        "role_assignment_id": role_assignment.pk if role_assignment else None,
    }
    for key, value in claims.items():
        refresh[key] = value

    return refresh, refresh.access_token


def serialize_auth_user(user, assignment):
    """Return the signed-in user, as `/api/v1/users/` renders one, plus their role."""
    data = UserAdminSerializer(user).data
    data["phone"] = user.phone_number or None
    data["is_active"] = user.is_active
    data["active_role"] = (
        RoleAssignmentSerializer(assignment).data if assignment else None
    )
    return data


def _set_refresh_cookie(response, refresh_token):
    """Write the httponly refresh cookie."""
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=str(refresh_token),
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="Lax",
        secure=False,
    )


def _session_response(user, http_status=status.HTTP_200_OK):
    """Return the one shape a successful sign-in produces, for login and register."""
    assignment = get_assignment(user)
    refresh, access = build_tokens_for_assignment(user, assignment)
    response = Response(
        {
            "user": serialize_auth_user(user, assignment),
            "accessToken": str(access),
        },
        status=http_status,
    )
    _set_refresh_cookie(response, refresh)
    return response


def _get_user(pk):
    """Fetch a user by primary key, or 404."""
    return get_object_or_404(User, pk=pk)


def _authenticate_by_email(email, password):
    """Sign in on the email address, since Django authenticates on the username."""
    # Email is not unique at the database level: `createsuperuser` leaves blanks.
    for candidate in User.objects.filter(email__iexact=email).order_by("pk"):
        user = authenticate(username=candidate.username, password=password)
        if user:
            return user
    return None


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_login(request):
    """POST /auth/login/ — {email, password} to an access token and refresh cookie."""
    email = (request.data.get("email") or "").strip()
    password = request.data.get("password") or ""

    if not email or not password:
        return Response(
            {"email": ["Email and password are required."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = _authenticate_by_email(email, password)
    if not user:
        return Response(
            {"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED
        )

    return _session_response(user)


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_register(request):
    """POST /auth/register/ — create an account and sign in."""
    serializer = UserCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return _session_response(user, http_status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_refresh(request):
    """POST /auth/refresh/ — a new token pair built from the current assignment."""
    raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
    if not raw_refresh:
        return Response(
            {"detail": "No refresh token."}, status=status.HTTP_401_UNAUTHORIZED
        )

    try:
        refresh = RefreshToken(raw_refresh)
        refresh.verify()
        refresh.blacklist()
        user = User.objects.get(pk=refresh[_user_id_claim()])
        old_role = refresh.payload.get("role")
        assignment = get_assignment(user)
        new_refresh, new_access = build_tokens_for_assignment(user, assignment)
        new_role = assignment.role if assignment else None
    except Exception as exc:
        _logger.debug("jwt_refresh failed: %s", exc)
        return Response(
            {"detail": "Invalid or expired refresh token."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # roleChanged tells the frontend its cached user object is stale.
    response = Response(
        {"accessToken": str(new_access), "roleChanged": old_role != new_role},
        status=status.HTTP_200_OK,
    )
    _set_refresh_cookie(response, new_refresh)
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def jwt_logout(request):
    """POST /auth/logout/ — blacklist the refresh token and clear the cookie."""
    raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
    if raw_refresh:
        try:
            RefreshToken(raw_refresh).blacklist()
        except Exception:
            pass
    response = Response(status=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(REFRESH_COOKIE)
    return response


def _user_id_claim():
    """Return SimpleJWT's user-id claim name."""
    try:
        from rest_framework_simplejwt.settings import api_settings

        return api_settings.USER_ID_CLAIM
    except Exception:
        return "sub"


class MeView(APIView):
    """GET /auth/me/ — the signed-in user and their current role."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Re-read, not from the token's claims: a role change lands on this call.
        return Response(serialize_auth_user(request.user, get_assignment(request.user)))


@api_view(["GET"])
@permission_classes([AllowAny])
def public_campus_list(request):
    """GET /auth/campuses/ — the campus list, public."""
    # Public, unlike /api/v1/campuses/: a registrant picks a campus with no token.
    from apps.org.models import Campus

    return Response(list(Campus.objects.order_by("name").values("id", "name", "code")))


class UserRoleAssignmentView(APIView):
    """GET and POST /users/{pk}/role-assignments/ — read the one role, or replace it."""

    # Admin only: one Maintenance HOS per campus is an org-level decision.
    permission_classes = [IsAuthenticated, IsAdminGroup]

    def get(self, request, user_pk):
        """Return the one role as a single-element list, because the frontend reads a list."""
        ra = get_assignment(_get_user(user_pk))
        return Response([RoleAssignmentSerializer(ra).data] if ra else [])

    def post(self, request, user_pk):
        """Replace the user's role, reporting anyone it displaced."""
        target = _get_user(user_pk)
        serializer = RoleAssignmentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, displaced = serializer.save(target, actor=request.user)

        body = RoleAssignmentSerializer(get_assignment(target)).data
        if displaced is not None:
            name = display_name(displaced)
            body["displaced"] = {
                "id": displaced.id,
                "full_name": name,
                "email": displaced.email,
                "detail": (
                    f"{name} held this post and is now a requester. Assign them a "
                    "new role if they are moving rather than leaving."
                ),
            }
        return Response(body, status=status.HTTP_201_CREATED)


class UserListCreateView(generics.ListCreateAPIView):
    """GET and POST /api/v1/users/ — the admin user list, and account creation.

    Paginated by `ConfigListPagination`, like every other admin config list.
    """

    permission_classes = [IsAuthenticated, IsAdminGroup]
    pagination_class = ConfigListPagination
    queryset = User.objects.select_related(
        "campus", "role_assignment__campus"
    ).order_by("-date_joined")

    def get_serializer_class(self):
        """The write shape for a create, the read shape for a list."""
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserAdminSerializer

    def create(self, request, *args, **kwargs):
        """Create an account and return it in the read shape."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            UserAdminSerializer(serializer.save()).data,
            status=status.HTTP_201_CREATED,
        )


class UserDetailView(APIView):
    """PATCH and DELETE /api/v1/users/{pk}/."""

    permission_classes = [IsAuthenticated, IsAdminGroup]

    def patch(self, request, pk):
        """Edit the account's email or campus."""
        serializer = UserUpdateSerializer(
            _get_user(pk), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        return Response(UserAdminSerializer(serializer.save()).data)

    def delete(self, request, pk):
        """Delete the account, unless it is the caller's own."""
        user = _get_user(pk)
        if user == request.user:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
