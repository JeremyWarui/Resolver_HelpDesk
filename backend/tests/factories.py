"""Object builders for the test suite.

Plain functions. The org-level builders are get_or_create, so two tests
asking for `campus("NRB")` get the same row.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.accounts.models import SCOPE_FIELD_BY_ROLE, TechnicianTrade
from apps.accounts.posts import assign_role
from apps.facilities.models import Facility, FacilityType
from apps.org.models import Campus, ServiceItem, Trade
from apps.sla.models import PRIORITY_LEVELS, Priority
from apps.tickets.models import Ticket

User = get_user_model()


def make_campus(code, name=None):
    return Campus.objects.get_or_create(
        code=code, defaults={"name": name or f"{code} Campus"}
    )[0]


def make_trade(name="Electrical", code=None, **kwargs):
    """A trade. Global — every campus fields every trade."""
    return Trade.objects.get_or_create(
        name=name, defaults={"code": code or name[:3].upper(), **kwargs}
    )[0]


def make_service_item(trade, name="Faulty socket"):
    return ServiceItem.objects.get_or_create(trade=trade, name=name)[0]


def make_facility_type(code="building", name=None):
    return FacilityType.objects.get_or_create(
        code=code, defaults={"name": name or code.replace("_", " ").title()}
    )[0]


def make_facility(campus, name="Administration Block", facility_type=None):
    """A place on a campus. Every ticket carries one, so `make_ticket` defaults
    to this campus's block."""
    return Facility.objects.get_or_create(
        campus=campus,
        name=name,
        defaults={"facility_type": facility_type or make_facility_type()},
    )[0]


def make_user(username, campus=None, role=None, trades=()):
    """Create a user at a campus and, optionally, give them their one post.

    A campus-scoped role is scoped to the campus they work at, which is what
    every fixture wants. The role goes through `assign_role`, so a fixture
    grants exactly the access production would.
    """
    user = User.objects.create_user(
        username=username,
        password="pw",
        email=f"{username}@example.test",
        campus=campus,
    )
    if role is not None:
        scope = {"campus": campus} if SCOPE_FIELD_BY_ROLE.get(role) == "campus" else {}
        assign_role(user, role, trades=list(trades), **scope)
    return user


def make_technician(username, campus, trades):
    """A technician holding specific (campus, trade) pairs.

    For a technician working a *second* campus, call `link_technician` after:
    the role row names one campus, while scope matches on the pairs, and the
    difference between those two is the bug the multi-campus test exists to
    catch.
    """
    return make_user(
        username, campus=campus, role="technician", trades=list(trades)
    )


def link_technician(user, campus, trade):
    """One more (campus, trade) pair beside the ones `assign_role` wrote."""
    return TechnicianTrade.objects.get_or_create(user=user, campus=campus, trade=trade)[0]


def escalate(ticket, now):
    """Run the escalation check on one ticket, as a run would. Returns whether it moved."""
    from apps.tickets.escalation import _escalate_candidates

    moved = [reached for _, _, reached in _escalate_candidates([(ticket.pk, ticket.current_level)], now)]
    if moved:
        ticket.current_level = moved[0]
    return bool(moved)


def make_priorities():
    """Create the four priorities the system ships with.

    From `sla.PRIORITY_LEVELS`, the same table `seed` writes, so the suite
    exercises the SLA windows the product actually runs on. Low (rank 1) is
    what `Priority.default()` returns.
    """
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
        for name, rank, response, resolution, hos_minutes, hod_minutes in PRIORITY_LEVELS
    ]


def make_ticket(raised_by, campus, trade, service_item=None, **kwargs):
    """A ticket in a specific (campus, trade) — the pair scope matches on.

    Opens at the default priority unless a test overrides it, mirroring
    production: the HOS sets priority at assignment, not the requester.
    """
    kwargs.setdefault("priority", Priority.default())
    kwargs.setdefault("requester_campus", campus)
    kwargs.setdefault("facility", make_facility(kwargs["requester_campus"]))
    kwargs.setdefault("description", "test ticket")
    kwargs.setdefault("contact_phone", "+254700000000")
    # Due dates come from the same helper production uses; leaving them null would
    # quietly disable every SLA assertion downstream.
    now = timezone.now()
    response_due, resolution_due = kwargs["priority"].due_dates(now)
    kwargs.setdefault("clock_started_at", now)
    kwargs.setdefault("response_due_at", response_due)
    kwargs.setdefault("resolution_due_at", resolution_due)
    return Ticket.objects.create(
        raised_by=raised_by,
        trade=trade,
        service_item=service_item or make_service_item(trade),
        **kwargs,
    )


def rate_ticket(ticket, rating, comment=""):
    """Rate a ticket the way `TicketFeedbackView` does, and return the ticket."""
    ticket.rating = rating
    ticket.rating_comment = comment
    ticket.rated_at = timezone.now()
    ticket.save(update_fields=["rating", "rating_comment", "rated_at"])
    return ticket


def age_ticket(ticket, **delta):
    """Backdate a ticket so it has genuinely been waiting.

    `created_at` is auto_now_add and cannot be assigned, so this is an UPDATE
    followed by a refresh.
    """
    then = timezone.now() - timedelta(**delta)
    Ticket.objects.filter(pk=ticket.pk).update(created_at=then, clock_started_at=then)
    ticket.refresh_from_db()
    return ticket
