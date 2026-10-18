"""
Auth and user-management endpoints, and the token claims they issue.

Every claim is re-read from the database at issue time, never copied from the
token being replaced, so a role change lands on the next silent refresh.
"""

import logging

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.identity import display_name
from apps.accounts.models import RoleAssignment, TechnicianTrade
from apps.accounts.password_reset import ResetRefused, normalise, reset_password, send_reset_link
from apps.accounts.scope import visible_campuses
from apps.accounts.serializers import (
    CampusRosterSerializer,
    RoleAssignmentSerializer,
    RoleAssignmentWriteSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
)
from apps.common.roles import IsAdminGroup, IsAdminOrManagerReadOnly, resolve_role
from apps.org.models import Campus

_logger = logging.getLogger(__name__)
User = get_user_model()

REFRESH_COOKIE = "resolver_refresh"


def build_tokens(user):
    """Return a (refresh, access) pair carrying the two claims that get read.

    `role` is what `common.roles.resolve_role` trusts, `campus_id` is what the
    frontend decodes, and nothing else belongs here: a JWT payload is base64,
    not encrypted, so an unread claim is a field published for no reason.
    """
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    # Their *home* campus, not what their role oversees.
    refresh["campus_id"] = user.campus_id
    return refresh, refresh.access_token


def serialize_auth_user(user):
    """The signed-in user in the shape `/users/` renders, plus their role."""
    data = UserAdminSerializer(user).data
    data["active_role"] = RoleAssignmentSerializer(user.assignment).data if user.assignment else None
    return data


def _set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=str(refresh_token),
        max_age=int(api_settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
        httponly=True,
        samesite="Lax",
        # Off only for local http development. This carries a seven-day session.
        secure=not settings.DEBUG,
    )


def _session_response(user):
    """What a successful sign-in returns: the user, an access token, the refresh cookie."""
    refresh, access = build_tokens(user)
    response = Response(
        {
            "user": serialize_auth_user(user),
            "accessToken": str(access),
        },
        status=status.HTTP_200_OK,
    )
    _set_refresh_cookie(response, refresh)
    return response


def _get_user(pk):
    return get_object_or_404(User, pk=pk)


def _authenticate_by_email(email, password):
    """Sign in on the email address, since Django authenticates on the username."""
    account = User.objects.filter(email__iexact=email).first()
    if account is None:
        return None
    return authenticate(username=account.username, password=password)


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_login(request):
    """POST /auth/login/ — {email, password} to an access token and refresh cookie."""
    email = (_field(request, "email") or "").strip()
    password = _field(request, "password") or ""

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
    """POST /auth/register/ — create an account. Signing in is a separate step."""
    serializer = UserCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(serialize_auth_user(user), status=status.HTTP_201_CREATED)


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
        user = User.objects.get(pk=refresh[api_settings.USER_ID_CLAIM], is_active=True)
    except Exception as exc:
        _logger.debug("jwt_refresh rejected a token: %s", exc)
        return Response(
            {"detail": "Invalid or expired refresh token."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    new_refresh, new_access = build_tokens(user)

    # The role as the database has it, not a verdict on whether it moved. The
    # client compares it against the cached user object it draws the shell
    # from, which is the copy that goes stale; the claim on the token being
    # replaced is not. Null for a plain requester, who holds no assignment.
    response = Response(
        {
            "accessToken": str(new_access),
            "role": user.role,
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
        return Response(serialize_auth_user(request.user))


class CampusRosterView(generics.ListAPIView):
    """GET /campus-roster/ — every campus with the post-holders behind it.

    The Campuses screen, for the admin and the manager. `org` serves the campus itself; the head and the
    technician count are posts, so they are read here, where posts live.
    """

    serializer_class = CampusRosterSerializer
    permission_classes = [IsAdminOrManagerReadOnly]

    def get_queryset(self):
        return (
            Campus.objects.prefetch_related(
                # One query per page, not per row. At most one row comes back:
                # `accounts.posts` displaces the incumbent when the post is filled.
                Prefetch(
                    "role_assignments",
                    # A deactivated head holds nothing: the post reads as vacant.
                    queryset=RoleAssignment.objects.filter(
                        role="hos", user__is_active=True
                    ).select_related("user"),
                    to_attr="hos_posts",
                )
            )
            # People, not links: a technician working two trades here has two rows.
            .annotate(
                technician_count=Count(
                    "technician_trades__user",
                    filter=Q(technician_trades__user__is_active=True),
                    distinct=True,
                )
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
    permission_classes = [IsAdminGroup]

    def get(self, request, pk):
        """Return the one role as a single-element list, because the frontend reads a list."""
        ra = _get_user(pk).assignment
        return Response([RoleAssignmentSerializer(ra).data] if ra else [])

    def post(self, request, pk):
        """Replace the user's role, reporting anyone it displaced."""
        target = _get_user(pk)
        serializer = RoleAssignmentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment, displaced = serializer.save(target, actor=request.user)

        body = RoleAssignmentSerializer(assignment).data
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

    permission_classes = [IsAdminGroup]
    queryset = (
        User.objects.select_related("campus", "role_assignment__campus")
        .prefetch_related("technician_trades")
        .order_by("-date_joined")
    )

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
    """PATCH /users/{pk}/. An account is never deleted: see UserActiveView."""

    permission_classes = [IsAdminGroup]

    def patch(self, request, pk):
        serializer = UserUpdateSerializer(
            _get_user(pk), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        return Response(UserAdminSerializer(serializer.save()).data)


class UserActiveView(APIView):
    """POST /users/{pk}/deactivate/ and /users/{pk}/reactivate/.

    A deactivated person cannot sign in, holds no post and drops off every
    picker; their tickets, comments and history stay as they were. The admin
    cannot deactivate themselves.
    """

    permission_classes = [IsAdminGroup]
    active = True

    def post(self, request, pk):
        user = _get_user(pk)
        if not self.active and user == request.user:
            return Response(
                {"detail": "You cannot deactivate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = self.active
        user.save(update_fields=["is_active"])
        return Response(UserAdminSerializer(user).data)


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
            campus__in=visible_campuses(request.user, role), user__is_active=True
        )
        if campus_id := request.query_params.get("campus"):
            links = links.filter(campus_id=campus_id)
        if trade_id := request.query_params.get("trade"):
            links = links.filter(trade_id=trade_id)
        links = links.select_related("trade").order_by("trade__name")

        trades = {}
        campuses = {}
        for link in links:
            ids, names = trades.setdefault(link.user_id, ([], []))
            if link.trade_id not in ids:
                ids.append(link.trade_id)
                names.append(link.trade.name)
            campuses.setdefault(link.user_id, set()).add(link.campus_id)

        # One query for the roster; serializing `link.user` would re-walk it per link.
        users = (
            User.objects.filter(pk__in=list(trades))
            .select_related("campus", "role_assignment__campus")
            .prefetch_related("technician_trades")
        )
        rows = UserAdminSerializer(users, many=True).data
        for row in rows:
            row["trade_ids"], row["trade_names"] = trades[row["id"]]
            # Every campus they hold a pair at, which can be more than their role's one.
            row["campus_ids"] = sorted(campuses[row["id"]])

        return Response(sorted(rows, key=lambda row: row["full_name"].lower()))


def _field(request, key):
    """A text field from the body, or None when the body is not an object or the value is not text."""
    data = request.data if isinstance(request.data, dict) else {}
    value = data.get(key)
    return value if isinstance(value, str) else None


class _ResetByEmailThrottle(SimpleRateThrottle):
    """Counts reset requests per address, in the form `send_reset_link` matches it by."""

    scope = "password_reset_email"

    def get_cache_key(self, request, view):
        email = normalise(_field(request, "email"))
        return self.cache_format % {"scope": self.scope, "ident": email} if email else None


class _ResetByIpThrottle(SimpleRateThrottle):
    scope = "password_reset_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class _ResetConfirmThrottle(_ResetByIpThrottle):
    scope = "password_reset_confirm"


RESET_SENT = "If an account uses that address, a link to reset its password is on its way."


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([_ResetByIpThrottle, _ResetByEmailThrottle])
def password_reset_request(request):
    """POST /auth/password-reset/ — {email}. The same answer whether or not the account exists."""
    email = (_field(request, "email") or "").strip()
    if not email:
        return Response({"email": ["Enter your email address."]}, status=status.HTTP_400_BAD_REQUEST)
    send_reset_link(email)
    return Response({"detail": RESET_SENT})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([_ResetConfirmThrottle])
def password_reset_confirm(request):
    """POST /auth/password-reset/confirm/ — {uid, token, password} sets the new password."""
    try:
        reset_password(_field(request, "uid"), _field(request, "token"), _field(request, "password") or "")
    except ResetRefused:
        return Response(
            {"token": ["This link has expired or has already been used. Ask for a new one."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except DjangoValidationError as exc:
        return Response({"password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": "Your password has been changed. Sign in with the new one."})
