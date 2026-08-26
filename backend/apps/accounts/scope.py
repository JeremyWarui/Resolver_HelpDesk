"""What each role may reach.

Two declarations, read by everything that narrows a queryset by role, plus the
lookups that resolve a role assignment to its org objects.

Contents:
    SCOPE_FIELD_BY_ROLE     purpose: the scope FK a RoleAssignment of each role
                            carries. Why: one declaration, so the model's
                            clean() and the write serializer cannot disagree.
    SCOPE_FIELDS            purpose: every scope FK, for the walks that check
                            "this one and nothing else".
    SECTION_PATH_BY_ROLE    purpose: how to walk from a Section to the user
                            holding it under each role.
    section_path            purpose: that path, prefixed for the model being
                            filtered ("" for Sections, "section" for Tickets).
                            None for technician, admin and user.
    technician_pair_exists  purpose: an Exists() matching a technician's
                            (campus, trade) pairs. Why: pairwise, never the
                            cross product.
    visible_sections        purpose: the Sections a user holds under a role.
                            Why: fail-closed — an unknown role sees none.
    campus_for              purpose: the campus a role assignment is scoped to,
                            or None for an admin, a manager or a plain user.
    department_for          purpose: its department, or None for an admin or a
                            plain user. Why: reached through the section for a
                            technician or an HOS, who have no direct FK.
    home_campus             purpose: where the person works (UserProfile.campus).
                            Why: this routes tickets they raise, not their scope.
    role_of                 purpose: the role string, or None.
    assignment_of           purpose: the RoleAssignment, or None.

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

# Exactly the field named here, or none at all where the value is None.
# `RoleAssignment.clean()` enforces it on save; the write serializer resolves
# its input through it. Neither restates the mapping.
SCOPE_FIELD_BY_ROLE = {
    "technician": "section",
    "hos": "section",
    "hod": "campus_department",
    "manager": "department",
    "admin": None,
    "user": None,
}

SCOPE_FIELDS = ("section", "campus_department", "department")

# A lookup path *from Section*. `technician` is absent on purpose: its scope is
# the (section, sub_section) pair, which is a subquery, not a path — see
# `technician_pair_exists`. `admin` and `user` are absent because neither is
# scoped by org structure at all.
SECTION_PATH_BY_ROLE = {
    "manager": "campus_department__department__manager_user",
    "hod": "campus_department__head_of_department",
    "hos": "hos",
}


def section_path(role, prefix=""):
    """`prefix` is the path to a Section on the model being filtered: "" when
    filtering Sections themselves, "section" when filtering Tickets.
    """
    path = SECTION_PATH_BY_ROLE.get(role)
    if path is None:
        return None
    return f"{prefix}__{path}" if prefix else path


def technician_pair_exists(user, section_field="section_id", sub_section_field="sub_section_id"):
    """Pairwise, never the cross product. Two independent `__in` lookups would also
    match a technician who is Carpentry@Nairobi and Plumbing@Mombasa against
    Plumbing@Nairobi and Carpentry@Mombasa, two pairs nobody assigned. The two
    forms agree for anyone working a single campus.
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
    """Section-granular even for a technician: their *sections* are the campuses
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


def campus_for(role_assignment):
    ra = role_assignment
    if ra is None:
        return None
    if ra.section_id and ra.section:
        return ra.section.campus_department.campus
    if ra.campus_department_id and ra.campus_department:
        return ra.campus_department.campus
    return None


def department_for(role_assignment):
    """The section branch is the only one that answers correctly for a technician
    or an HOS: their department is reached through their section.
    """
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
    """Where they work, not what their role oversees: this is what routes a ticket
    they raise, so a manager raising one at Nairobi gets a Nairobi ticket rather
    than one addressed to every campus they oversee.
    """
    profile = getattr(user, "profile", None)
    return profile.campus if profile and profile.campus_id else None


def role_of(user):
    from apps.accounts.models import RoleAssignment

    try:
        return user.role_assignment.role
    except (RoleAssignment.DoesNotExist, AttributeError):
        return None


def assignment_of(user):
    from apps.accounts.models import RoleAssignment

    try:
        return user.role_assignment
    except (RoleAssignment.DoesNotExist, AttributeError):
        return None
