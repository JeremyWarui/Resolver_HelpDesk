"""
Auth and user-management endpoints, and the token claims they issue.

Every claim is re-read from the database at issue time rather than copied from
the token being replaced, so a role change lands on the next silent refresh.
"""

import logging

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.identity import display_name
from apps.accounts.models import RoleAssignment, TechnicianTrade
from apps.accounts.scope import visible_campuses
from apps.accounts.serializers import (
    CampusRosterSerializer,
    RoleAssignmentSerializer,
    RoleAssignmentWriteSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
)
from apps.common.roles import IsAdminGroup, resolve_role
from apps.org.models import Campus

_logger = logging.getLogger(__name__)
User = get_user_model()

REFRESH_COOKIE = "resolver_refresh"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60


def get_assignment(user):
    # select_related covers the two FKs RoleAssignmentSerializer renders. The
    # trade list is a separate query no select_related can reach, and this is
    # never serialized many at once.
    return (
        RoleAssignment.objects.filter(user=user)
        .select_related("campus", "assigned_by")
        .first()
    )


def build_tokens_for_assignment(user, role_assignment):
    """Return a (refresh, access) pair carrying the two claims that get read.

    `role` is what `common.roles.resolve_role` trusts, `campus_id` is what the
    frontend decodes, and nothing else belongs here: a JWT payload is base64,
    not encrypted, so an unread claim is a field published for no reason.
    """
    refresh = RefreshToken.for_user(user)
    refresh["role"] = role_assignment.role if role_assignment else None
    # Their *home* campus, not what their role oversees.
    refresh["campus_id"] = user.campus_id
    return refresh, refresh.access_token


def serialize_auth_user(user, assignment):
    """The signed-in user in the shape `/users/` renders, plus their role."""
    data = UserAdminSerializer(user).data
    data["active_role"] = (
        RoleAssignmentSerializer(assignment).data if assignment else None
    )
    return data


def _set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=str(refresh_token),
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="Lax",
        # Off only for local http development. This carries a seven-day session.
        secure=not settings.DEBUG,
    )


def _session_response(user, http_status=status.HTTP_200_OK):
    """The one shape a successful sign-in produces. Login and register share it."""
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

    # Only the token work is guarded. Answering a failure further down with 401
    # would send the caller to the login screen for a fault signing in cannot fix.
    try:
        refresh = RefreshToken(raw_refresh)
        refresh.verify()
        refresh.blacklist()
        user = User.objects.get(pk=refresh[api_settings.USER_ID_CLAIM])
    except Exception as exc:
        _logger.debug("jwt_refresh rejected a token: %s", exc)
        return Response(
            {"detail": "Invalid or expired refresh token."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    assignment = get_assignment(user)
    new_refresh, new_access = build_tokens_for_assignment(user, assignment)

    # The role as the database has it, not a verdict on whether it moved. The
    # client compares it against the cached user object it draws the shell
    # from, which is the copy that goes stale; the claim on the token being
    # replaced is not. Null for a plain requester, who holds no assignment.
    response = Response(
        {
            "accessToken": str(new_access),
            "role": assignment.role if assignment else None,
        },
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
            # An expired or already-blacklisted token is still a signed-out user.
            pass
    response = Response(status=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(REFRESH_COOKIE)
    return response


class MeView(APIView):
    """GET /auth/me/ — the signed-in user and their current role."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Re-read, not from the token's claims: a role change lands on this call.
        return Response(serialize_auth_user(request.user, get_assignment(request.user)))


class CampusRosterView(generics.ListAPIView):
    """GET /campus-roster/ — every campus with the post-holders behind it.

    The admin Campuses screen. `org` serves the campus itself; the head and the
    technician count are posts, so they are read here, where posts live.
    """

    serializer_class = CampusRosterSerializer
    permission_classes = [IsAuthenticated, IsAdminGroup]

    def get_queryset(self):
        return (
            Campus.objects.prefetch_related(
                # One query per page, not per row. At most one row comes back:
                # `accounts.posts` displaces the incumbent when the post is filled.
                Prefetch(
                    "role_assignments",
                    queryset=RoleAssignment.objects.filter(role="hos").select_related(
                        "user"
                    ),
                    to_attr="hos_posts",
                )
            )
            # People, not links: a technician working two trades here has two rows.
            .annotate(
                technician_count=Count("technician_trades__user", distinct=True)
            ).order_by("name")
        )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_campus_list(request):
    """GET /auth/campuses/ — the campus list."""
    # Public, unlike /api/v1/campuses/: a registrant picks a campus with no token.
    return Response(list(Campus.objects.order_by("name").values("id", "name", "code")))


class UserRoleAssignmentView(APIView):
    """GET and POST /users/{pk}/role-assignments/ — read the one role, or replace it."""

    # Admin only: one Maintenance HOS per campus is an org-level decision.
    permission_classes = [IsAuthenticated, IsAdminGroup]

    def get(self, request, pk):
        """Return the one role as a single-element list, because the frontend reads a list."""
        ra = get_assignment(_get_user(pk))
        return Response([RoleAssignmentSerializer(ra).data] if ra else [])

    def post(self, request, pk):
        """Replace the user's role, reporting anyone it displaced."""
        target = _get_user(pk)
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
    """GET and POST /users/ — the admin user list, and account creation."""

    permission_classes = [IsAuthenticated, IsAdminGroup]
    queryset = User.objects.select_related(
        "campus", "role_assignment__campus"
    ).order_by("-date_joined")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserAdminSerializer

    def create(self, request, *args, **kwargs):
        """Answer in the read shape, not the write shape that came in."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            UserAdminSerializer(serializer.save()).data,
            status=status.HTTP_201_CREATED,
        )


class UserDetailView(APIView):
    """PATCH and DELETE /users/{pk}/."""

    permission_classes = [IsAuthenticated, IsAdminGroup]

    def patch(self, request, pk):
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


class ScopedTechnicianRosterView(APIView):
    """GET /technicians/ — the technicians in the caller's scope, and their trades.

    Includes idle ones, unlike any list derived from tickets. Scope comes from
    the JWT role and fails closed; `?campus=` and `?trade=` narrow what it
    returned. The assignment modal must send the trade, or an HOS can give a
    Plumbing job to a carpenter, who then gets a 403 on their own ticket.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = resolve_role(request)
        links = TechnicianTrade.objects.filter(
            campus__in=visible_campuses(request.user, role)
        )
        if campus_id := request.query_params.get("campus"):
            links = links.filter(campus_id=campus_id)
        if trade_id := request.query_params.get("trade"):
            links = links.filter(trade_id=trade_id)
        links = links.select_related("trade").order_by("trade__name")

        trades = {}
        for link in links:
            ids, names = trades.setdefault(link.user_id, ([], []))
            if link.trade_id not in ids:
                ids.append(link.trade_id)
                names.append(link.trade.name)

        # One query for the roster; serializing `link.user` would re-walk it per link.
        users = User.objects.filter(pk__in=list(trades)).select_related(
            "campus", "role_assignment__campus"
        )
        rows = UserAdminSerializer(users, many=True).data
        for row in rows:
            row["trade_ids"], row["trade_names"] = trades[row["id"]]

        return Response(sorted(rows, key=lambda row: row["full_name"].lower()))
