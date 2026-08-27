"""Reporting — the figures, and whose figures they are.

Every endpoint renders the caller's own server-derived scope, so the tests that
matter prove two roles get different answers from one endpoint. Paused tickets
are the recurring trap: they must not count as overdue.
"""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.analytics.role_config import resolve_group_by
from apps.analytics.services import (
    aggregate,
    breakdown,
)
from apps.tickets.lifecycle import transition_status
from apps.tickets.scope import scoped_ticket_qs
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def window():
    """A 30-day window that stays open for the length of the test.

    `date_to` sits slightly ahead of now because a test creates and resolves
    its tickets *after* this fixture runs, whereas in production the window
    closes at request time with everything it counts already in place.
    """
    now = timezone.now()
    return {
        "date_from": now - timedelta(days=30),
        "date_to": now + timedelta(minutes=5),
    }


def _advance(ticket, *statuses, actor, **kwargs):
    for status in statuses:
        transition_status(ticket, status, actor=actor, **kwargs)


def test_the_figures_are_computed_over_the_callers_scope(
    nrb_hos,
    msa_hos,
    nrb_electrical_ticket,
    msa_electrical_ticket,
    window,
):
    assert aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)["created"] == 1
    assert aggregate(scoped_ticket_qs(msa_hos, "hos"), window)["created"] == 1


def test_an_hods_numbers_exclude_another_campus(
    nrb_hod,
    nrb_electrical_ticket,
    msa_electrical_ticket,
    window,
):
    data = aggregate(scoped_ticket_qs(nrb_hod, "hod"), window)
    assert data["created"] == 1
    assert data["open_backlog"] == 1


def test_a_breakdown_of_an_empty_scope_is_empty_not_everything(
    msa_hos,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
    window,
):
    """Fail-closed: a scope with nothing in it returns nothing, never the lot."""
    assert breakdown(scoped_ticket_qs(msa_hos, "hos"), window, "sub_section") == []


def test_ratings_are_scoped_like_the_tickets_they_belong_to(
    nrb_hos,
    msa_hos,
    nrb_electrical_ticket,
    msa_electrical_ticket,
    nrb_electrician,
    msa_electrician,
    window,
):
    from apps.tickets.models import TicketFeedback

    for ticket, tech in (
        (nrb_electrical_ticket, nrb_electrician),
        (msa_electrical_ticket, msa_electrician),
    ):
        ticket.assigned_to = tech
        ticket.save(update_fields=["assigned_to"])
        _advance(ticket, "assigned", "in_progress", "resolved", actor=tech)
        TicketFeedback.objects.create(ticket=ticket, rating=5)

    assert aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)["feedback_count"] == 1
    assert aggregate(scoped_ticket_qs(msa_hos, "hos"), window)["feedback_count"] == 1


def test_a_paused_ticket_is_never_counted_as_overdue(
    nrb_hos,
    nrb_electrical_ticket,
    nrb_electrician,
    window,
):
    """`pending` freezes the clock, so a ticket waiting on parts is blocked,
    not late. Counting it would make the number un-actionable."""
    ticket = nrb_electrical_ticket
    ticket.assigned_to = nrb_electrician
    ticket.save(update_fields=["assigned_to"])
    _advance(ticket, "assigned", "in_progress", actor=nrb_electrician)
    transition_status(
        ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="material_not_in_store",
    )
    ticket.resolution_due_at = timezone.now() - timedelta(hours=2)
    ticket.save(update_fields=["resolution_due_at"])

    assert aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)["breached"] == 0


def test_a_running_ticket_past_its_target_is_counted_as_overdue(
    nrb_hos,
    nrb_electrical_ticket,
    window,
):
    nrb_electrical_ticket.resolution_due_at = timezone.now() - timedelta(hours=2)
    nrb_electrical_ticket.save(update_fields=["resolution_due_at"])

    assert aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)["breached"] == 1


def test_a_settled_ticket_is_judged_against_resolved_at_not_the_clock(
    nrb_hos,
    nrb_electrical_ticket,
    nrb_electrician,
    window,
):
    """A resolved ticket keeps its verdict. Comparing its due date to "now"
    would mark every ticket ever closed as late once that date passed."""
    ticket = nrb_electrical_ticket
    ticket.assigned_to = nrb_electrician
    ticket.save(update_fields=["assigned_to"])
    _advance(ticket, "assigned", "in_progress", "resolved", actor=nrb_electrician)
    ticket.resolution_due_at = timezone.now() - timedelta(hours=2)
    ticket.save(update_fields=["resolution_due_at"])

    data = aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)
    assert data["breached"] == 0
    # Resolved after its target, so it counts against the attainment figure.
    assert data["resolution_sla_pct"] == 0.0


def test_the_ticket_badge_agrees_with_the_overdue_count(
    api,
    nrb_hos,
    nrb_electrical_ticket,
    window,
):
    """One ticket, two readers: the list's `is_breaching` flag and the reported
    count must never disagree about what late means."""
    nrb_electrical_ticket.resolution_due_at = timezone.now() - timedelta(hours=2)
    nrb_electrical_ticket.save(update_fields=["resolution_due_at"])

    api.force_authenticate(nrb_hos)
    row = api.get(reverse("ticket-list")).data["results"][0]

    assert row["is_breaching"] is True
    assert aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)["breached"] == 1


def test_the_reported_volume_agrees_with_the_ticket_list(
    api,
    nrb_hos,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
    msa_electrical_ticket,
):
    api.force_authenticate(nrb_hos)
    listed = api.get(reverse("ticket-list")).data["count"]
    reported = api.get(reverse("analytics:analytics")).data["headline"]["open_backlog"]

    assert listed == reported == 2


def test_the_endpoint_requires_authentication(api):
    assert api.get(reverse("analytics:analytics")).status_code == 401


def test_trade_breakdown_splits_by_craft(
    nrb_hos,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
    window,
):
    rows = breakdown(scoped_ticket_qs(nrb_hos, "hos"), window, "sub_section")
    assert {row["label"]: row["total"] for row in rows} == {
        "Electrical": 1,
        "Plumbing": 1,
    }


def test_trade_breakdown_does_not_leak_another_campus(
    nrb_hos,
    nrb_electrical_ticket,
    msa_electrical_ticket,
    window,
):
    rows = breakdown(scoped_ticket_qs(nrb_hos, "hos"), window, "sub_section")
    assert sum(row["total"] for row in rows) == 1


def test_status_breakdown_counts_each_ticket_once(
    nrb_hos,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
    window,
):
    rows = breakdown(scoped_ticket_qs(nrb_hos, "hos"), window, "status")
    assert sum(row["total"] for row in rows) == 2


def test_facility_breakdown_counts_by_location(
    nrb_hos,
    nrb,
    electrical,
    requester,
    facility_types,
    priorities,
    window,
):
    from apps.facilities.models import Facility
    from apps.tickets.models import TicketLocation

    block = Facility.objects.create(
        campus=nrb, facility_type=facility_types["office_block"], name="Admin Block"
    )
    for _ in range(2):
        ticket = factories.make_ticket(requester, nrb, electrical)
        TicketLocation.objects.create(
            ticket=ticket,
            facility=block,
            values={"floor": "2", "room": "204"},
        )

    rows = breakdown(scoped_ticket_qs(nrb_hos, "hos"), window, "facility")
    assert [(row["label"], row["total"]) for row in rows] == [("Admin Block", 2)]


def test_facility_breakdown_does_not_leak_another_campus(
    msa_hos,
    nrb,
    electrical,
    requester,
    facility_types,
    priorities,
    window,
):
    from apps.facilities.models import Facility
    from apps.tickets.models import TicketLocation

    block = Facility.objects.create(
        campus=nrb, facility_type=facility_types["office_block"], name="Admin Block"
    )
    ticket = factories.make_ticket(requester, nrb, electrical)
    TicketLocation.objects.create(
        ticket=ticket,
        facility=block,
        values={"floor": "2", "room": "204"},
    )

    assert breakdown(scoped_ticket_qs(msa_hos, "hos"), window, "facility") == []


def test_technician_performance_counts_per_assignee(
    nrb_hos,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
    nrb_electrician,
    window,
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.save(update_fields=["assigned_to"])

    rows = breakdown(scoped_ticket_qs(nrb_hos, "hos"), window, "technician")
    # The unassigned plumbing ticket is a triage gap, not a technician's row.
    assert [(row["label"], row["total"]) for row in rows] == [("nrb_electrician", 1)]


@pytest.mark.parametrize(
    "role,requested,expected",
    [
        # A technician is never ranked against a peer, however they ask.
        ("technician", "technician", "status"),
        # A requester has nothing to be compared against.
        ("user", "campus", "status"),
        # Fail closed: an unknown role gets the requester's view.
        ("director_of_everything", "campus", "status"),
        # And an allowed dimension is still honoured.
        ("hos", "sub_section", "sub_section"),
    ],
)
def test_a_role_cannot_widen_its_own_view_with_a_query_param(role, requested, expected):
    """The dimension a role may be compared on is the server's decision. A
    stale or hostile client asking for one it is not served gets the role's
    default, never the dimension."""
    assert resolve_group_by(role, requested) == expected


def test_a_requester_is_measured_only_on_their_own_tickets(
    api,
    requester,
    msa_requester,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    api.force_authenticate(requester)
    data = api.get(reverse("analytics:analytics")).data

    assert data["headline"]["open_backlog"] == 1
