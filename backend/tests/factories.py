"""Object builders for the test suite.

Plain functions rather than a factory library: the org graph has hard structural
rules (a Section's type must match its CampusDepartment's department, a
technician's trade must belong to their section's type) and explicit builders
make a violation obvious at the call site instead of hiding it behind defaults.

Every builder is safe to call repeatedly — the org-level ones are get_or_create,
so two tests asking for `campus("NRB")` get the same row.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.accounts.models import UserProfile
from apps.accounts.posts import add_trade, assign_role
from apps.sla.clock import compute_due_dates
from apps.org.models import (
    Campus,
    CampusDepartment,
    Department,
    Section,
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


def make_section(campus_department, section_type=None):
    """A campus's instance of a section type — this is the row that carries campus.

    Takes no `hos`: who heads a section is written by `accounts.posts`, never by
    assigning the FK. Give someone the post with
    `make_user(..., role="hos", section=section)`.
    """
    return Section.objects.get_or_create(
        campus_department=campus_department,
        section_type=section_type or make_section_type(),
    )[0]


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
    """Create a user with a profile campus and, optionally, their one post.

    `scope` takes the same keys as `accounts.posts.assign_role`: section /
    campus_department / department, plus `sub_sections=[...]` for a technician.
    The role goes through `assign_role` rather than being inserted, so a fixture
    grants exactly the access production would — a test whose HOS could see
    tickets only because the fixture also set `section.hos` by hand was testing
    the fixture, not the system.
    """
    user = User.objects.create_user(
        username=username,
        password="pw",
        email=f"{username}@example.test",
        phone_number=f"+2547{abs(hash(username)) % 100_000_000:08d}",
    )
    UserProfile.objects.create(user=user, campus=campus)
    if role is not None:
        assign_role(user, role, **scope)
    return user


def make_technician(username, section, sub_sections, campus=None):
    """A technician holding specific (section, sub_section) pairs.

    For a technician working a *second* campus, call `link_technician` after:
    the role row names one section, while scope matches on the pairs, and the
    difference between those two is the bug the multi-campus test exists to
    catch.
    """
    return make_user(
        username,
        campus=campus or section.campus_department.campus,
        role="technician",
        section=section,
        sub_sections=list(sub_sections),
    )


def link_technician(user, section, sub_section):
    """One more (campus, trade) pair — `accounts.posts` writes it, not this."""
    return add_trade(user, section, sub_section)


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
    # Due dates come from the same helper production uses. Leaving them null
    # would quietly disable every SLA assertion downstream.
    response_due, resolution_due = compute_due_dates(kwargs["priority"], timezone.now())
    kwargs.setdefault("response_due_at", response_due)
    kwargs.setdefault("resolution_due_at", resolution_due)
    return Ticket.objects.create(
        raised_by=raised_by,
        section=section,
        sub_section=sub_section,
        service_item=service_item or make_service_item(sub_section),
        **kwargs,
    )


def age_ticket(ticket, **delta):
    """Backdate a ticket so it has genuinely been waiting.

    `created_at` is auto_now_add and cannot be assigned, so this is an UPDATE
    followed by a refresh. Two test modules had a copy each.
    """
    Ticket.objects.filter(pk=ticket.pk).update(
        created_at=timezone.now() - timedelta(**delta)
    )
    ticket.refresh_from_db()
    return ticket
