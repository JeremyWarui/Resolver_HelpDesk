"""Object builders for the test suite.

Plain functions, not a factory library: the org graph has structural rules a
default would hide. The org-level builders are get_or_create, so two tests
asking for `campus("NRB")` get the same row.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.accounts.posts import add_trade, assign_role
from apps.accounts.scope import SCOPE_FIELD_BY_ROLE
from apps.sla.clock import compute_due_dates
from apps.org.models import Campus, ServiceItem, SubSection
from apps.sla.models import Priority
from apps.tickets.models import Ticket

User = get_user_model()


def make_campus(code, name=None):
    return Campus.objects.get_or_create(
        code=code, defaults={"name": name or f"{code} Campus"}
    )[0]


def make_sub_section(name="Electrical", code=None, **kwargs):
    """A trade. Global — every campus fields every trade."""
    return SubSection.objects.get_or_create(
        name=name, defaults={"code": code or name[:3].upper(), **kwargs}
    )[0]


def make_service_item(sub_section, name="Faulty socket"):
    return ServiceItem.objects.get_or_create(sub_section=sub_section, name=name)[0]


def make_user(username, campus=None, role=None, sub_sections=()):
    """Create a user at a campus and, optionally, give them their one post.

    A campus-scoped role is scoped to the campus they work at, which is what
    every fixture wants. The role goes through `assign_role` rather than being
    inserted, so a fixture grants exactly the access production would.
    """
    user = User.objects.create_user(
        username=username,
        password="pw",
        email=f"{username}@example.test",
        phone_number=f"+2547{abs(hash(username)) % 100_000_000:08d}",
        campus=campus,
    )
    if role is not None:
        scope = {"campus": campus} if SCOPE_FIELD_BY_ROLE.get(role) == "campus" else {}
        assign_role(user, role, sub_sections=list(sub_sections), **scope)
    return user


def make_technician(username, campus, sub_sections):
    """A technician holding specific (campus, trade) pairs.

    For a technician working a *second* campus, call `link_technician` after:
    the role row names one campus, while scope matches on the pairs, and the
    difference between those two is the bug the multi-campus test exists to
    catch.
    """
    return make_user(
        username, campus=campus, role="technician", sub_sections=list(sub_sections)
    )


def link_technician(user, campus, sub_section):
    """One more (campus, trade) pair — `accounts.posts` writes it, not this."""
    return add_trade(user, campus, sub_section)


# (name, rank, response_minutes, resolution_minutes, hos_minutes, hod_minutes)
PRIORITY_SPECS = [
    ("Low", 1, 480, 4320, 1440, 2880),
    ("Medium", 2, 240, 1440, 720, 1440),
    ("High", 3, 60, 480, 240, 480),
    ("Critical", 4, 30, 240, 60, 120),
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
                "escalate_to_hos_minutes": hos_minutes,
                "escalate_to_hod_minutes": hod_minutes,
            },
        )[0]
        for name, rank, response, resolution, hos_minutes, hod_minutes in PRIORITY_SPECS
    ]


def make_ticket(raised_by, campus, sub_section, service_item=None, **kwargs):
    """A ticket in a specific (campus, trade) — the pair scope matches on.

    Opens at the default priority unless a test overrides it, mirroring
    production: the HOS sets priority at assignment, not the requester.
    """
    kwargs.setdefault("priority", Priority.default())
    kwargs.setdefault("requester_campus", campus)
    kwargs.setdefault("description", "test ticket")
    kwargs.setdefault("contact_phone", raised_by.phone_number)
    # Due dates come from the same helper production uses; leaving them null would
    # quietly disable every SLA assertion downstream.
    response_due, resolution_due = compute_due_dates(kwargs["priority"], timezone.now())
    kwargs.setdefault("response_due_at", response_due)
    kwargs.setdefault("resolution_due_at", resolution_due)
    return Ticket.objects.create(
        raised_by=raised_by,
        sub_section=sub_section,
        service_item=service_item or make_service_item(sub_section),
        **kwargs,
    )


def age_ticket(ticket, **delta):
    """Backdate a ticket so it has genuinely been waiting.

    `created_at` is auto_now_add and cannot be assigned, so this is an UPDATE
    followed by a refresh.
    """
    Ticket.objects.filter(pk=ticket.pk).update(
        created_at=timezone.now() - timedelta(**delta)
    )
    ticket.refresh_from_db()
    return ticket
