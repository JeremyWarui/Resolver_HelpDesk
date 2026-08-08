"""Auth and user-management views."""

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import RoleAssignment, UserProfile
from apps.accounts.serializers import (
    RoleAssignmentSerializer,
    RoleAssignmentCreateSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
)
from apps.accounts.jwt_utils import (
    build_tokens_for_assignment,
    get_assignment,
    serialize_auth_user,
)
from apps.common.permissions import get_request_role

REFRESH_COOKIE = "resolver_refresh"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


def _set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=str(refresh_token),
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="Lax",
        secure=False,
    )


def _clear_refresh_cookie(response):
    response.delete_cookie(REFRESH_COOKIE)


class MeView(APIView):
    """GET /auth/me/ — profile + role assignment."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Re-read the assignment rather than trusting the token's claims, so an
        # admin's role change lands on the next /me/ instead of at token expiry.
        assignment = get_assignment(request.user)
        return Response(serialize_auth_user(request.user, assignment))


def _sync_org_scope(target, ra, old_ra):
    """Keep the org-structural FKs in sync with the RoleAssignment.

    `scoped_ticket_qs` / `scoped_section_qs` read `Section.hos`,
    `CampusDepartment.head_of_department`, `Department.manager_user` and
    `SectionTechnician` directly — never RoleAssignment — so a promotion that
    only writes a RoleAssignment row would be a silent no-op for the promoted
    user's actual access. This is what closes that gap, in both directions.
    """
    from apps.org.models import (
        CampusDepartment,
        Department,
        Section,
        SectionTechnician,
    )

    # Backward first: strip whatever the previous role granted, so a
    # technician moving campus does not keep the old campus's links.
    if old_ra is not None:
        if old_ra.role == "hos" and old_ra.section_id:
            Section.objects.filter(pk=old_ra.section_id, hos=target).update(hos=None)
        elif old_ra.role == "hod" and old_ra.campus_department_id:
            CampusDepartment.objects.filter(
                pk=old_ra.campus_department_id, head_of_department=target
            ).update(head_of_department=None)
        elif old_ra.role == "manager" and old_ra.department_id:
            Department.objects.filter(
                pk=old_ra.department_id, manager_user=target
            ).update(manager_user=None)
        elif old_ra.role == "technician":
            SectionTechnician.objects.filter(user=target).delete()

    # Forward: grant scope for the new assignment.
    if ra.role == "technician" and ra.section_id:
        # One link per trade. Technician scope is the set of (section,
        # sub_section) pairs, so this is where a technician's access actually
        # comes from — the RoleAssignment alone grants nothing.
        for sub_section in ra._sub_sections:
            SectionTechnician.objects.get_or_create(
                user=target, section_id=ra.section_id, sub_section=sub_section
            )
    elif ra.role == "hos" and ra.section_id:
        # One HOS per section: whoever held it is displaced by this assignment.
        Section.objects.filter(pk=ra.section_id).update(hos=target)
    elif ra.role == "hod" and ra.campus_department_id:
        CampusDepartment.objects.filter(pk=ra.campus_department_id).update(
            head_of_department=target
        )
    elif ra.role == "manager" and ra.department_id:
        Department.objects.filter(pk=ra.department_id).update(manager_user=target)


class UserRoleAssignmentView(APIView):
    """GET + POST /users/{user_pk}/role-assignments/ — admin only.

    A user has exactly one role. GET returns it as a single-element list (the
    frontend reads a list here); POST replaces it, syncing the org-structural
    FKs and, for technicians, the SectionTechnician trade links.

    Only an admin may assign roles — HOD does not, since there is no cover to
    arrange and a single Maintenance HOS per campus is an org-level decision.
    """

    permission_classes = [IsAuthenticated]

    def _get_target_user(self):
        from django.contrib.auth import get_user_model
        from django.shortcuts import get_object_or_404

        User = get_user_model()
        return get_object_or_404(User, pk=self.kwargs["user_pk"])

    def get(self, request, user_pk):
        if get_request_role(request) != "admin":
            return Response(
                {"detail": "Only an admin may read role assignments."},
                status=status.HTTP_403_FORBIDDEN,
            )
        target = self._get_target_user()
        ra = (
            RoleAssignment.objects.filter(user=target)
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
        return Response([RoleAssignmentSerializer(ra).data] if ra else [])

    def post(self, request, user_pk):
        from django.db import transaction

        if get_request_role(request) != "admin":
            return Response(
                {"detail": "Only an admin may assign roles."},
                status=status.HTTP_403_FORBIDDEN,
            )

        target = self._get_target_user()
        serializer = RoleAssignmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        sub_sections = vd.pop("sub_sections", [])
        # Frontend-friendly keys, already resolved to FK objects in validate().
        vd.pop("campus_id", None)
        vd.pop("department_id", None)
        vd.pop("section_id", None)
        vd.pop("sub_section_ids", None)

        with transaction.atomic():
            old_ra = (
                RoleAssignment.objects.select_for_update()
                .filter(user=target)
                .select_related("section", "campus_department", "department")
                .first()
            )
            if old_ra is not None:
                # Replace rather than update, so assigned_by/assigned_at reflect
                # who made this change.
                old_ra.delete()
            ra = RoleAssignment.objects.create(
                user=target, assigned_by=request.user, **vd
            )
            ra._sub_sections = sub_sections
            _sync_org_scope(target, ra, old_ra)

        ra = RoleAssignment.objects.select_related(
            "section__campus_department__campus",
            "section__campus_department__department",
            "section__section_type",
            "campus_department__campus",
            "campus_department__department",
            "department",
            "assigned_by",
        ).get(pk=ra.pk)
        return Response(
            RoleAssignmentSerializer(ra).data, status=status.HTTP_201_CREATED
        )


# ── Auth endpoints: login / refresh / logout ───────────────────────────────────
# Migrated from tickets/api/jwt_auth_views.py

import logging
from django.contrib.auth import authenticate, get_user_model
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.tokens import RefreshToken as _RefreshToken
from apps.accounts.jwt_utils import ensure_floor_assignment

_logger = logging.getLogger(__name__)
_User = get_user_model()


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_login(request):
    """POST /auth/login/ — password login, returns JWT access token + sets refresh cookie."""
    username = request.data.get("username")
    password = request.data.get("password")

    if not username or not password:
        return Response(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "username and password are required",
                }
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    user = authenticate(username=username, password=password)
    if not user:
        return Response(
            {"error": {"code": "UNAUTHORIZED", "message": "Invalid credentials"}},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    assignment = get_assignment(user)
    refresh, access = build_tokens_for_assignment(user, assignment)

    response = Response(
        {
            "user": serialize_auth_user(user, assignment),
            "accessToken": str(access),
        },
        status=status.HTTP_200_OK,
    )
    _set_refresh_cookie(response, refresh)
    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def public_campus_list(request):
    """GET /auth/campuses/ — minimal campus list for the public registration form.
    Unlike /api/v1/campuses/ (admin-only), this is intentionally public: a new
    registrant has no JWT yet and must pick their campus before an account exists."""
    from apps.org.models import Campus

    data = list(Campus.objects.order_by("name").values("id", "name", "code"))
    return Response(data)


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_register(request):
    """POST /auth/register/ — create account, auto-assign user floor role, return JWT."""
    username = request.data.get("username", "").strip()
    email = request.data.get("email", "").strip()
    password = request.data.get("password", "")
    first_name = request.data.get("first_name", "").strip()
    last_name = request.data.get("last_name", "").strip()
    campus_id = request.data.get("campus_id")

    if not first_name or not last_name or not email or not password or not campus_id:
        return Response(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "first_name, last_name, email, password and campus_id are required",
                }
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    if username and _User.objects.filter(username=username).exists():
        return Response(
            {"error": {"code": "CONFLICT", "message": "Username already taken"}},
            status=status.HTTP_409_CONFLICT,
        )
    if _User.objects.filter(email=email).exists():
        return Response(
            {"error": {"code": "CONFLICT", "message": "Email already registered"}},
            status=status.HTTP_409_CONFLICT,
        )

    from apps.org.models import Campus

    if not Campus.objects.filter(pk=campus_id).exists():
        return Response(
            {"error": {"code": "VALIDATION_ERROR", "message": "Campus not found"}},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    if not username:
        base = f"{first_name.lower()}.{last_name.lower()}"
        username = base
        n = 1
        while _User.objects.filter(username=username).exists():
            username = f"{base}{n}"
            n += 1

    user = _User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )
    ensure_floor_assignment(user)
    UserProfile.objects.create(user=user, campus_id=campus_id)

    assignment = get_assignment(user)
    refresh, access = build_tokens_for_assignment(user, assignment)

    response = Response(
        {
            "user": serialize_auth_user(user, assignment),
            "accessToken": str(access),
        },
        status=status.HTTP_201_CREATED,
    )
    _set_refresh_cookie(response, refresh)
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_refresh(request):
    """POST /auth/refresh/ — rotate refresh token, return new access token."""
    raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
    if not raw_refresh:
        return Response(
            {"error": {"code": "UNAUTHORIZED", "message": "No refresh token"}},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        refresh = _RefreshToken(raw_refresh)
        refresh.verify()

        # Rotate: blacklist old, issue new pair scoped to the user's *current*
        # role assignment — not a copy of the old token's claims — so a
        # promotion/demotion is picked up on the very next silent refresh
        # instead of persisting stale scope for up to REFRESH_TOKEN_LIFETIME.
        refresh.blacklist()
        uid_claim = _get_user_id_claim()
        user = _User.objects.get(pk=refresh[uid_claim])
        old_role = refresh.payload.get("role")
        # Re-read from the DB, never from the token: an admin's role change must
        # land on the next silent refresh rather than at token expiry.
        active_assignment = get_assignment(user)
        new_refresh, new_access = build_tokens_for_assignment(user, active_assignment)
        new_role = active_assignment.role if active_assignment else None

    except Exception as exc:
        _logger.debug("jwt_refresh failed: %s", exc)
        return Response(
            {
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Invalid or expired refresh token",
                }
            },
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # roleChanged tells the frontend its cached user object (role, sidebar,
    # dashboard choice — all set at login/switch-role time, never touched by
    # a silent refresh) is now stale, so it should force a clean re-login
    # rather than keep serving a UI built for the old role.
    response = Response(
        {"accessToken": str(new_access), "roleChanged": old_role != new_role},
        status=status.HTTP_200_OK,
    )
    _set_refresh_cookie(response, new_refresh)
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def jwt_logout(request):
    """POST /auth/logout/ — blacklist refresh token, clear cookie."""
    raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
    if raw_refresh:
        try:
            _RefreshToken(raw_refresh).blacklist()
        except Exception:
            pass

    response = Response(status=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


def _get_user_id_claim():
    try:
        from rest_framework_simplejwt.settings import api_settings

        return api_settings.USER_ID_CLAIM
    except Exception:
        return "sub"


# ── Admin: user CRUD ──────────────────────────────────────────────────────────


class UserListCreateView(APIView):
    """GET + POST /api/v1/users/ — admin-only user management."""

    permission_classes = [IsAuthenticated]

    def _require_admin(self, request):
        if get_request_role(request) != "admin":
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Only admins may manage users.")

    def get(self, request):
        self._require_admin(request)
        from django.contrib.auth import get_user_model

        User = get_user_model()
        # role_assignment is a OneToOne now, so the whole scope graph joins in
        # one query — no prefetch, no N+1.
        qs = User.objects.select_related(
            "profile__campus",
            "role_assignment__section__campus_department__campus",
            "role_assignment__section__campus_department__department",
            "role_assignment__section__section_type",
            "role_assignment__campus_department__campus",
            "role_assignment__campus_department__department",
            "role_assignment__department",
        ).order_by("-date_joined")

        serializer = UserAdminSerializer(qs, many=True)
        return Response(
            {
                "count": qs.count(),
                "next": None,
                "previous": None,
                "results": serializer.data,
            }
        )

    def post(self, request):
        self._require_admin(request)
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserAdminSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class UserDetailView(APIView):
    """PATCH + DELETE /api/v1/users/<pk>/ — admin-only."""

    permission_classes = [IsAuthenticated]

    def _require_admin(self, request):
        if get_request_role(request) != "admin":
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Only admins may manage users.")

    def _get_user(self, pk):
        from django.contrib.auth import get_user_model
        from django.shortcuts import get_object_or_404

        return get_object_or_404(get_user_model(), pk=pk)

    def patch(self, request, pk):
        self._require_admin(request)
        user = self._get_user(pk)
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserAdminSerializer(user).data)

    def delete(self, request, pk):
        self._require_admin(request)
        user = self._get_user(pk)
        if user == request.user:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
