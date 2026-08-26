"""What each role may reach.

Two declarations, which everything that narrows a queryset by role reads:

    SCOPE_FIELD_BY_ROLE   the scope FK a RoleAssignment of each role carries
    SECTION_PATH_BY_ROLE  how to walk from a Section to the user who holds it

Model imports are function-local: `accounts.models` imports the declarations
from here, so a module-level import would close a cycle.

Used by:
    accounts.models       SCOPE_FIELD_BY_ROLE, SCOPE_FIELDS, role_of
    accounts.posts        SCOPE_FIELD_BY_ROLE
    accounts.serializers  SCOPE_FIELD_BY_ROLE, assignment_of, campus_for, department_for, …
    accounts.views        department_for, home_campus
    org.views             visible_sections
    tickets.scope         section_path, technician_pair_exists
"""

from django.db.models import Exists, OuterRef

# ── Declaration 1: the scope FK each role carries ─────────────────────────────
# Exactly the field named here, or none at all where the value is None.
# `RoleAssignment.clean()` enforces it on every save; the write serializer
# resolves its input through it. Neither restates the mapping.
SCOPE_FIELD_BY_ROLE = {
    "technician": "section",
    "hos": "section",
    "hod": "campus_department",
    "manager": "department",
    "admin": None,
    "user": None,
}

# Every scope FK on RoleAssignment, for the walks that check "and nothing else".
SCOPE_FIELDS = ("section", "campus_department", "department")


# ── Declaration 2: how a role reaches a Section ───────────────────────────────
# Read as a lookup path *from Section*. `technician` is absent on purpose: its
# scope is the (section, sub_section) pair, which is not a path but a subquery —
# see `technician_pair_exists`. `admin` and `user` are absent because neither is
# scoped by org structure at all.
SECTION_PATH_BY_ROLE = {
    "manager": "campus_department__department__manager_user",
    "hod": "campus_department__head_of_department",
    "hos": "hos",
}


def section_path(role, prefix=""):
    """The lookup path from `prefix` to the user holding `role`, or None.

    `prefix` is the path to a Section on the model being filtered: "" when
    filtering Sections themselves, "section" when filtering Tickets.
    """
    path = SECTION_PATH_BY_ROLE.get(role)
    if path is None:
        return None
    return f"{prefix}__{path}" if prefix else path


def technician_pair_exists(user, section_field="section_id", sub_section_field="sub_section_id"):
    """An Exists() matching rows whose (section, sub_section) pair this user works.

    Pairwise, never the cross product. Two independent `__in` lookups would also
    match a technician who is Carpentry@Nairobi and Plumbing@Mombasa against
    Plumbing@Nairobi and Carpentry@Mombasa, two pairs nobody assigned. The two
    forms agree for anyone working a single campus.

    Called by tickets.scope.scoped_ticket_qs.
    """
    from apps.org.models import SectionTechnician

    return Exists(
        SectionTechnician.objects.filter(
            user=user,
            section_id=OuterRef(section_field),
            sub_section_id=OuterRef(sub_section_field),
        )
    )


def visible_sections(user, role):
    """The Sections `user` holds under `role`. Fail-closed: unknown role → none.

    Section-granular even for a technician: their *sections* are the campuses
    they work at, and the trade narrowing happens on tickets. Anything listing
    technicians per trade filters `SectionTechnician` itself.
    """
    from apps.org.models import Section, SectionTechnician

    base = Section.objects.select_related(
        "campus_department__department",
        "campus_department__campus",
        "section_type",
    )

    if role == "admin":
        return base

    if role == "technician":
        return base.filter(
            pk__in=SectionTechnician.objects.filter(user=user).values_list(
                "section_id", flat=True
            )
        )

    path = section_path(role)
    if path is None:
        return base.none()
    return base.filter(**{path: user})


# ── Resolving a role assignment's org objects ─────────────────────────────────
# One definition each. `department_for` walks through the section, which is the
# only branch that answers correctly for a technician or an HOS: their
# department is reached through their section, not held on a direct FK.


def campus_for(role_assignment):
    """The campus a role assignment is scoped to, or None (admin, manager, user)."""
    ra = role_assignment
    if ra is None:
        return None
    if ra.section_id and ra.section:
        return ra.section.campus_department.campus
    if ra.campus_department_id and ra.campus_department:
        return ra.campus_department.campus
    return None


def department_for(role_assignment):
    """The department a role assignment is scoped to, or None (admin, user)."""
    ra = role_assignment
    if ra is None:
        return None
    if ra.department_id and ra.department:
        return ra.department
    if ra.section_id and ra.section:
        return ra.section.campus_department.department
    if ra.campus_department_id and ra.campus_department:
        return ra.campus_department.department
    return None


def home_campus(user):
    """The user's own campus (UserProfile.campus): where they work, not what
    their role oversees.

    This is what routes a ticket they raise. Routing derives from the service
    item and the requester's campus, never from their role, so a manager raising
    a ticket at Nairobi gets a Nairobi ticket rather than one addressed to every
    campus they oversee.
    """
    profile = getattr(user, "profile", None)
    return profile.campus if profile and profile.campus_id else None


def role_of(user):
    """The user's role string, or None. The one place the lookup is spelled out.

    `common.roles.resolve_role` prefers the JWT claim and falls back to this.
    """
    from apps.accounts.models import RoleAssignment

    try:
        return user.role_assignment.role
    except (RoleAssignment.DoesNotExist, AttributeError):
        return None


def assignment_of(user):
    """The user's RoleAssignment, or None — free off a select_related list view."""
    from apps.accounts.models import RoleAssignment

    try:
        return user.role_assignment
    except (RoleAssignment.DoesNotExist, AttributeError):
        return None
