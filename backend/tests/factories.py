"""Object builders for the test suite.

Plain functions rather than a factory library: the org graph has hard structural
rules (a Section's type must match its CampusDepartment's department, a
technician's trade must belong to their section's type) and explicit builders
make a violation obvious at the call site instead of hiding it behind defaults.

Every builder is safe to call repeatedly — the org-level ones are get_or_create,
so two tests asking for `campus("NRB")` get the same row.
"""

from django.contrib.auth import get_user_model

from apps.accounts.models import RoleAssignment, UserProfile
from apps.org.models import (
    Campus,
    CampusDepartment,
    Department,
    Section,
    SectionTechnician,
    SectionType,
    ServiceItem,
    SubSection,
)
from apps.sla.models import Priority
from apps.tickets.models import Ticket

User = get_user_model()


# ── Org structure ─────────────────────────────────────────────────────────────


def make_campus(code, name=None):
    return Campus.objects.get_or_create(
        code=code, defaults={"name": name or f"{code} Campus"}
    )[0]


def make_department(code="ADM", name="Administration"):
    return Department.objects.get_or_create(code=code, defaults={"name": name})[0]


def make_campus_department(campus, department=None):
    return CampusDepartment.objects.get_or_create(
        campus=campus, department=department or make_department()
    )[0]


def make_section_type(department=None, code="MAINT", name="Maintenance"):
    return SectionType.objects.get_or_create(
        department=department or make_department(),
        name=name,
        defaults={"code": code},
    )[0]


def make_section(campus_department, section_type=None, hos=None):
    """A campus's instance of a section type — this is the row that carries campus."""
    section = Section.objects.get_or_create(
        campus_department=campus_department,
        section_type=section_type or make_section_type(),
    )[0]
    if hos is not None:
        section.hos = hos
        section.save(update_fields=["hos"])
    return section


def make_sub_section(section_type=None, name="Electrical", code=None, **kwargs):
    """A trade. Global — shared across every campus running the section type."""
    return SubSection.objects.get_or_create(
        section_type=section_type or make_section_type(),
        name=name,
        defaults={"code": code or name[:3].upper(), **kwargs},
    )[0]


def make_service_item(sub_section, name="Faulty socket"):
    return ServiceItem.objects.get_or_create(sub_section=sub_section, name=name)[0]


# ── Users and roles ───────────────────────────────────────────────────────────


def make_user(username, campus=None, role=None, **scope):
    """Create a user with a profile campus and, optionally, their one role.

    `scope` takes the same keys as RoleAssignment: section / campus_department /
    department. Technicians additionally need `sub_sections=[...]`, since a role
    row alone grants a technician nothing — see `make_technician`.
    """
    user = User.objects.create_user(
        username=username,
        password="pw",
        email=f"{username}@example.test",
        phone_number=f"07{abs(hash(username)) % 100_000_000:08d}",
    )
    UserProfile.objects.create(user=user, campus=campus)
    if role is not None:
        scope.pop("sub_sections", None)
        RoleAssignment.objects.create(user=user, role=role, **scope)
    return user


def make_technician(username, section, sub_sections, campus=None):
    """A technician linked to specific (section, sub_section) pairs.

    Pass several sections by calling this once and then `link_technician` again:
    the pairs are what scope matches on, never the cross product.
    """
    user = make_user(
        username, campus=campus or section.campus_department.campus,
        role="technician", section=section,
    )
    for sub_section in sub_sections:
        link_technician(user, section, sub_section)
    return user


def link_technician(user, section, sub_section):
    return SectionTechnician.objects.get_or_create(
        user=user, section=section, sub_section=sub_section
    )[0]


# ── SLA ───────────────────────────────────────────────────────────────────────


PRIORITY_SPECS = [
    ("Low", 1, 480, 4320),
    ("Medium", 2, 240, 1440),
    ("High", 3, 60, 480),
    ("Critical", 4, 30, 240),
]


def make_priorities():
    """Seed the four priorities. Low (rank 1) is what `Priority.default()` returns."""
    return [
        Priority.objects.get_or_create(
            rank=rank,
            defaults={
                "name": name,
                "response_minutes": response,
                "resolution_minutes": resolution,
            },
        )[0]
        for name, rank, response, resolution in PRIORITY_SPECS
    ]


# ── Tickets ───────────────────────────────────────────────────────────────────


def make_ticket(raised_by, section, sub_section, service_item=None, **kwargs):
    """A ticket in a specific (section, sub_section) — the pair scope matches on.

    Opens at the default priority unless a test overrides it, mirroring
    production: the HOS sets priority at assignment, not the requester.
    """
    kwargs.setdefault("priority", Priority.default())
    kwargs.setdefault("requester_campus", section.campus_department.campus)
    kwargs.setdefault("description", "test ticket")
    kwargs.setdefault("contact_phone", raised_by.phone_number)
    return Ticket.objects.create(
        raised_by=raised_by,
        section=section,
        sub_section=sub_section,
        service_item=service_item or make_service_item(sub_section),
        **kwargs,
    )
