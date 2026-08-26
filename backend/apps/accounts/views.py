"""Auth and user-management endpoints, and the token claims they issue.

Thin on purpose. Identity rules live in `identity.py`, authority in `scope.py`,
writing a post in `posts.py`, and the payload shapes in `serializers.py`. A view
here reads the request, calls one of those, and renders the result.

Used by:
    accounts.urls   every route under /auth/ and /users/
"""

import logging

from django.contrib.auth import authenticate, get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.identity import display_name
from apps.accounts.models import RoleAssignment
from apps.accounts.scope import department_for, home_campus
from apps.accounts.serializers import (
    RoleAssignmentSerializer,
    RoleAssignmentWriteSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
)
from apps.common.roles import IsAdminGroup

_logger = logging.getLogger(__name__)
User = get_user_model()

REFRESH_COOKIE = "resolver_refresh"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


# ── Tokens ────────────────────────────────────────────────────────────────────
# Claims carried on both tokens of a pair, beyond SimpleJWT's own:
#
#     role, campus_id, department_id, campus_department_id, section_id,
#     role_assignment_id, email
#
# `campus_id` is the user's *home* campus, which routes tickets they raise, not
# what their role oversees. Every claim is re-read from the database at issue
# time, never copied from the token being replaced, so an admin's role change
# lands on the next silent refresh rather than at expiry.


def get_assignment(user):
    """The user's RoleAssignment with its scope graph, or None.

    The select_related list is what `RoleAssignmentSerializer` walks, so
    serializing the result costs no further queries.
    """
    return (
        RoleAssignment.objects.filter(user=user)
        .select_related(
            "section__campus_department__campus",
            "section__campus_department__department",
            "section__section_type",
            "campus_department__campus",
            "campus_department__department",
            "department",
            "assigned_by",
        )
        .first()
    )


def build_tokens_for_assignment(user, role_assignment):
    """Return a (refresh, access) pair carrying the scope claims."""
    refresh = RefreshToken.for_user(user)  # sets USER_ID_CLAIM from user.pk

    department = department_for(role_assignment)
    campus = home_campus(user)

    claims = {
        "email": user.email,
        "role": role_assignment.role if role_assignment else None,
        "campus_id": campus.pk if campus else None,
        "department_id": department.pk if department else None,
        "campus_department_id": (
            role_assignment.campus_department_id if role_assignment else None
        ),
        "section_id": role_assignment.section_id if role_assignment else None,
        "role_assignment_id": role_assignment.pk if role_assignment else None,
    }
    for key, value in claims.items():
        refresh[key] = value

    return refresh, refresh.access_token


def serialize_auth_user(user, assignment):
    """The signed-in user, in the same shape `/api/v1/users/` returns.

    One shape for a person, from every endpoint that returns one. `active_role`
    keeps its name because every frontend reader spells it that way.
    """
    data = UserAdminSerializer(user).data
    data["phone"] = user.phone_number or None
    data["is_active"] = user.is_active
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
        secure=False,
    )


def _session_response(user, http_status=status.HTTP_200_OK):
    """The one shape a successful sign-in returns, from login and register both."""
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


# ── Session ───────────────────────────────────────────────────────────────────


def _authenticate_by_email(email, password):
    """Authenticate on the email address, which is what people sign in with.

    Django authenticates on the username, so the email is resolved to an
    account first. Email is not unique at the database level (a blank one from
    `createsuperuser` collides), so every match is tried rather than assuming
    there is exactly one.
    """
    for candidate in User.objects.filter(email__iexact=email).order_by("pk"):
        user = authenticate(username=candidate.username, password=password)
        if user:
            return user
    return None


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_login(request):
    """POST /auth/login/ — {email, password} → access token + refresh cookie."""
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
    """POST /auth/register/ — create an account from the email, return a session.

    Uses the same serializer as the admin create endpoint, so the two cannot
    disagree about what an account is.
    """
    serializer = UserCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return _session_response(user, http_status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_refresh(request):
    """POST /auth/refresh/ — rotate the refresh cookie, return a new access token.

    The new pair is built from the user's *current* assignment, never from the
    old token's claims, so a promotion or demotion is picked up on the next
    silent refresh instead of persisting stale scope until the token expires.
    """
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

    # roleChanged tells the frontend its cached user object (role, sidebar,
    # dashboard choice — all set at sign-in and never touched by a silent
    # refresh) is stale, so it should force a clean re-login rather than keep
    # serving a UI built for the old role.
    response = Response(
        {"accessToken": str(new_access), "roleChanged": old_role != new_role},
        status=status.HTTP_200_OK,
    )
    _set_refresh_cookie(response, new_refresh)
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def jwt_logout(request):
    """POST /auth/logout/ — blacklist the refresh token, clear the cookie."""
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
    try:
        from rest_framework_simplejwt.settings import api_settings

        return api_settings.USER_ID_CLAIM
    except Exception:
        return "sub"


class MeView(APIView):
    """GET /auth/me/ — the signed-in user and their role.

    Re-reads the assignment rather than trusting the token's claims, so an
    admin's role change lands on the next call instead of at token expiry.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            serialize_auth_user(request.user, get_assignment(request.user))
        )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_campus_list(request):
    """GET /auth/campuses/ — campuses for the registration form.

    Public on purpose, unlike /api/v1/campuses/: a new registrant has no token
    yet and has to pick their campus before an account exists.
    """
    from apps.org.models import Campus

    return Response(list(Campus.objects.order_by("name").values("id", "name", "code")))


# ── Roles ─────────────────────────────────────────────────────────────────────


class UserRoleAssignmentView(APIView):
    """GET + POST /users/{user_pk}/role-assignments/ — admin only.

    A user has exactly one role. GET returns it as a single-element list (the
    frontend reads a list here); POST replaces it. Only an admin may assign:
    a single Maintenance HOS per campus is an org-level decision, not a
    departmental one.
    """

    permission_classes = [IsAuthenticated, IsAdminGroup]

    def get(self, request, user_pk):
        ra = get_assignment(_get_user(user_pk))
        return Response([RoleAssignmentSerializer(ra).data] if ra else [])

    def post(self, request, user_pk):
        target = _get_user(user_pk)
        serializer = RoleAssignmentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, displaced = serializer.save(target, actor=request.user)

        body = RoleAssignmentSerializer(get_assignment(target)).data
        if displaced is not None:
            # Surfaced, not buried in an audit log: the admin filling a post
            # rarely knows who was in it, and the demotion is a bigger change
            # than the one they asked for.
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


# ── Accounts ──────────────────────────────────────────────────────────────────


class UserListCreateView(APIView):
    """GET + POST /api/v1/users/ — admin-only account management."""

    permission_classes = [IsAuthenticated, IsAdminGroup]

    def get(self, request):
        # role_assignment is a OneToOne, so the whole scope graph joins in one
        # query — no prefetch, no N+1.
        qs = User.objects.select_related(
            "profile__campus",
            "role_assignment__section__campus_department__campus",
            "role_assignment__section__campus_department__department",
            "role_assignment__section__section_type",
            "role_assignment__campus_department__campus",
            "role_assignment__campus_department__department",
            "role_assignment__department",
        ).order_by("-date_joined")

        return Response(
            {
                "count": qs.count(),
                "next": None,
                "previous": None,
                "results": UserAdminSerializer(qs, many=True).data,
            }
        )

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(
            UserAdminSerializer(serializer.save()).data,
            status=status.HTTP_201_CREATED,
        )


class UserDetailView(APIView):
    """PATCH + DELETE /api/v1/users/<pk>/ — admin-only."""

    permission_classes = [IsAuthenticated, IsAdminGroup]

    def patch(self, request, pk):
        serializer = UserUpdateSerializer(_get_user(pk), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(UserAdminSerializer(serializer.save()).data)

    def delete(self, request, pk):
        user = _get_user(pk)
        if user == request.user:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
