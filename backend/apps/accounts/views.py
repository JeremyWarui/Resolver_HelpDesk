"""Auth and user-management views."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
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
from apps.common.permissions import IsAdminGroup
from apps.accounts.identity import display_name

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


def _demote_displaced(incumbent, actor):
    """Drop a displaced supervisor to plain `user`, scope cleared.

    A supervisor post holds exactly one person (SOT §3b). Handing it to someone
    else therefore *demotes* whoever had it — and until this existed, only half
    of that happened: `_sync_org_scope` overwrote `Section.hos` and left the old
    holder's RoleAssignment untouched, so they kept the HOS label, the HOS
    dashboard and the HOS JWT claim while `scoped_ticket_qs` — which reads the
    structural FK — showed them nothing. A section head with a working portal
    and zero tickets, and no event anywhere saying why.

    Demoting to `user` rather than deleting the row keeps the invariant that
    every user has exactly one RoleAssignment, and `user` is the floor role
    everyone has anyway. It is deliberately not a guess at what they should be
    instead: if they are moving to another section, the admin assigns that next,
    and this simply stops them holding a post that is no longer theirs.
    """
    RoleAssignment.objects.filter(user=incumbent).delete()
    return RoleAssignment.objects.create(
        user=incumbent,
        role="user",
        section=None,
        campus_department=None,
        department=None,
        assigned_by=actor,
    )


def _sync_org_scope(target, ra, old_ra, actor=None):
    """Keep the org-structural FKs in sync with the RoleAssignment.

    `scoped_ticket_qs` / `scoped_section_qs` read `Section.hos`,
    `CampusDepartment.head_of_department`, `Department.manager_user` and
    `SectionTechnician` directly — never RoleAssignment — so a promotion that
    only writes a RoleAssignment row would be a silent no-op for the promoted
    user's actual access. This is what closes that gap, in both directions.

    Returns the user displaced from a supervisor post by this assignment, or
    None. The caller reports it, because "you have just demoted Peter" is not
    something an admin should have to infer from a screen that no longer
    mentions him.
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
    displaced = None
    if ra.role == "technician" and ra.section_id:
        # One link per trade. Technician scope is the set of (section,
        # sub_section) pairs, so this is where a technician's access actually
        # comes from — the RoleAssignment alone grants nothing.
        for sub_section in ra._sub_sections:
            SectionTechnician.objects.get_or_create(
                user=target, section_id=ra.section_id, sub_section=sub_section
            )
    elif ra.role == "hos" and ra.section_id:
        # One HOS per section: whoever held it is displaced by this assignment,
        # and displaced means demoted — read the incumbent *before* the update
        # overwrites them, or there is nothing left to demote.
        displaced = (
            Section.objects.filter(pk=ra.section_id)
            .values_list("hos", flat=True)
            .first()
        )
        Section.objects.filter(pk=ra.section_id).update(hos=target)
    elif ra.role == "hod" and ra.campus_department_id:
        displaced = (
            CampusDepartment.objects.filter(pk=ra.campus_department_id)
            .values_list("head_of_department", flat=True)
            .first()
        )
        CampusDepartment.objects.filter(pk=ra.campus_department_id).update(
            head_of_department=target
        )
    elif ra.role == "manager" and ra.department_id:
        displaced = (
            Department.objects.filter(pk=ra.department_id)
            .values_list("manager_user", flat=True)
            .first()
        )
        Department.objects.filter(pk=ra.department_id).update(manager_user=target)

    # Re-assigning someone to the post they already hold is a scope edit, not a
    # displacement — demoting them here would revoke the role being granted.
    if displaced in (None, target.pk):
        return None

    from django.contrib.auth import get_user_model

    incumbent = get_user_model().objects.filter(pk=displaced).first()
    if incumbent is None:
        return None
    _demote_displaced(incumbent, actor)
    return incumbent


def _get_user(pk):
    """Fetch a user by pk or 404. Deferred model import — this module is
    imported from settings-time code paths."""
    from django.contrib.auth import get_user_model
    from django.shortcuts import get_object_or_404

    return get_object_or_404(get_user_model(), pk=pk)


class UserRoleAssignmentView(APIView):
    """GET + POST /users/{user_pk}/role-assignments/ — admin only.

    A user has exactly one role. GET returns it as a single-element list (the
    frontend reads a list here); POST replaces it, syncing the org-structural
    FKs and, for technicians, the SectionTechnician trade links.

    Only an admin may assign roles — HOD does not, since there is no cover to
    arrange and a single Maintenance HOS per campus is an org-level decision.
    """

    permission_classes = [IsAuthenticated, IsAdminGroup]

    def get(self, request, user_pk):
        target = _get_user(self.kwargs["user_pk"])
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

        target = _get_user(self.kwargs["user_pk"])
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
            # `of=("self",)` locks the RoleAssignment row only. All three
            # select_related FKs are nullable, so they join LEFT OUTER, and
            # PostgreSQL refuses `FOR UPDATE` against the nullable side of an
            # outer join — a bare select_for_update() here made every role
            # assignment 500. The row being replaced is the only one that needs
            # locking; the scope objects are read, not written.
            old_ra = (
                RoleAssignment.objects.select_for_update(of=("self",))
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
            displaced = _sync_org_scope(target, ra, old_ra, actor=request.user)

        ra = RoleAssignment.objects.select_related(
            "section__campus_department__campus",
            "section__campus_department__department",
            "section__section_type",
            "campus_department__campus",
            "campus_department__department",
            "department",
            "assigned_by",
        ).get(pk=ra.pk)
        body = RoleAssignmentSerializer(ra).data
        if displaced is not None:
            # Surfaced, not buried in an audit log: the admin filling a post
            # rarely knows who was in it, and the demotion is a bigger change
            # than the one they asked for.
            body["displaced"] = {
                "id": displaced.id,
                "full_name": display_name(displaced),
                "email": displaced.email,
                "detail": (
                    f"{display_name(displaced)} held this "
                    "post and is now a requester. Assign them a new role if they "
                    "are moving rather than leaving."
                ),
            }
        return Response(body, status=status.HTTP_201_CREATED)


# ── Auth endpoints: login / refresh / logout ───────────────────────────────────
# Migrated from tickets/api/jwt_auth_views.py

import logging
from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from apps.accounts.identity import identity_from_email
from apps.accounts.jwt_utils import ensure_floor_assignment

_logger = logging.getLogger(__name__)
_User = get_user_model()


def _authenticate_by_email(email, password):
    """Authenticate on the email address, which is what people sign in with.

    Django authenticates on the username, so the email has to be resolved to an
    account first. Email is not unique at the database level — a legacy row or a
    `createsuperuser` left blank can collide — so every match is tried instead of
    assuming there is exactly one.
    """
    for candidate in _User.objects.filter(email__iexact=email).order_by("pk"):
        user = authenticate(username=candidate.username, password=password)
        if user:
            return user
    return None


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_login(request):
    """POST /auth/login/ — email + password, returns JWT access token + sets refresh cookie."""
    email = (request.data.get("email") or "").strip()
    password = request.data.get("password") or ""

    if not email or not password:
        return Response(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "email and password are required",
                }
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    user = _authenticate_by_email(email, password)
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
    """POST /auth/register/ — create account from the email address, return JWT.

    The email is the whole identity: `jeremy.mwangi@ksg.ac.ke` becomes username
    `jeremy.mwangi`, first name Jeremy, last name Mwangi. Names are never taken
    from the client, so an account's display name and its login can't drift
    apart.
    """
    email = (request.data.get("email") or "").strip()
    password = request.data.get("password") or ""
    campus_id = request.data.get("campus_id")

    if not email or not password or not campus_id:
        return Response(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "email, password and campus_id are required",
                }
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    try:
        validate_email(email)
    except DjangoValidationError:
        return Response(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Enter a valid email address",
                }
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    if _User.objects.filter(email__iexact=email).exists():
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

    username, first_name, last_name = identity_from_email(email)
    if not first_name:
        return Response(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Your email must have a name before the '@' — "
                    "e.g. jeremy.mwangi@ksg.ac.ke",
                }
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

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
        refresh = RefreshToken(raw_refresh)
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
            RefreshToken(raw_refresh).blacklist()
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

    permission_classes = [IsAuthenticated, IsAdminGroup]

    def get(self, request):
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
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserAdminSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class UserDetailView(APIView):
    """PATCH + DELETE /api/v1/users/<pk>/ — admin-only."""

    permission_classes = [IsAuthenticated, IsAdminGroup]

    def patch(self, request, pk):
        user = _get_user(pk)
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserAdminSerializer(user).data)

    def delete(self, request, pk):
        user = _get_user(pk)
        if user == request.user:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
