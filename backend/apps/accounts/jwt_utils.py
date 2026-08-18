"""
JWT token helpers — scope-aware authentication (SoT §3.6).

Claims on every token (beyond SimpleJWT defaults):
  role               — role string (user/technician/hos/hod/manager/admin)
  campus_id          — user's home campus from UserProfile (routing source for requesters)
  department_id      — for hod/manager scope
  section_id         — for technician/hos scope
  role_assignment_id — pk of the user's RoleAssignment

A user has exactly one role, so there is no active/available distinction and no
role switching: the claims are a snapshot of the single RoleAssignment.
"""

from apps.accounts.models import RoleAssignment
from apps.accounts.services import resolve_campus_and_department_names
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.services import home_campus_from_user


def ensure_floor_assignment(user):
    """Guarantee the user has a RoleAssignment, defaulting to role='user'.

    Called at registration and wherever a new user is created. A no-op if the
    user already has one (of any role), so it is safe to call unconditionally.
    """
    RoleAssignment.objects.get_or_create(user=user, defaults={"role": "user"})


def _department_id_for_assignment(role_assignment):
    """Resolve department_id: direct FK or via campus_department."""
    if role_assignment.department_id:
        return role_assignment.department_id
    if role_assignment.campus_department_id:
        try:
            return role_assignment.campus_department.department_id
        except Exception:
            pass
    return None


def build_tokens_for_assignment(user, role_assignment):
    """Return (refresh, access) token pair scoped to the given RoleAssignment.

    Both tokens carry: sub, role, campus_id, department_id, section_id,
    role_assignment_id.

    role_assignment should always be non-None after ensure_floor_assignment()
    runs at user creation. None is still handled defensively.
    """
    refresh = RefreshToken.for_user(
        user
    )  # sets token["sub"] = user.pk via USER_ID_CLAIM

    if role_assignment is not None:
        role = role_assignment.role
        department_id = _department_id_for_assignment(role_assignment)
        section_id = role_assignment.section_id
        ra_id = role_assignment.pk
    else:
        role = None
        department_id = None
        section_id = None
        ra_id = None

    scope_claims = {
        "email": user.email,
        "role": role,
        "campus_id": campus.pk if (campus := home_campus_from_user(user)) else None,
        "department_id": department_id,
        "campus_department_id": (
            role_assignment.campus_department_id if role_assignment else None
        ),
        "section_id": section_id,
        "role_assignment_id": ra_id,
    }
    for key, value in scope_claims.items():
        refresh[key] = value

    access = refresh.access_token
    return refresh, access


def get_assignment(user):
    """Return the user's RoleAssignment, or None.

    Always re-read from the DB rather than trusting a token's
    role_assignment_id: an admin who changes someone's role must take effect on
    the next refresh, not when the old token happens to expire.
    """
    return (
        RoleAssignment.objects.filter(user=user)
        .select_related("section", "campus_department", "department")
        .first()
    )


def serialize_role_assignment(ra):
    """Return a dict representation of a RoleAssignment."""
    return {
        "id": ra.pk,
        "role": ra.role,
        "section_id": ra.section_id,
        "campus_department_id": ra.campus_department_id,
        "department_id": ra.department_id,
    }


def serialize_auth_user(user, assignment):
    """Return the AuthUser shape expected by the frontend (GET /auth/me/).

    `active_role` is kept as the field name — the frontend reads it everywhere —
    but it is simply the user's one role; there is nothing to switch between.
    """
    names = resolve_campus_and_department_names(user, assignment)
    return {
        "id": user.pk,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "phone": getattr(user, "phone_number", None) or None,
        "is_active": user.is_active,
        "home_campus_name": names["home_campus_name"],
        "primary_department_name": names["primary_department_name"],
        "section_name": names["section_name"],
        "active_role": (
            serialize_role_assignment(assignment) if assignment else None
        ),
    }
