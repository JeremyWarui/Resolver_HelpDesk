"""The demo data `seed` writes follows the same routing rules as the API."""

import io
import os
from unittest import mock

import pytest
from django.core.management import call_command
from django.test import override_settings
from django.db.models import F

from apps.tickets.models import Ticket

pytestmark = pytest.mark.django_db


@pytest.fixture(scope="module")
def seeded(django_db_setup, django_db_blocker, tmp_path_factory):
    """Seed once for the module; every test reads the same demo data, then it goes."""
    media = tmp_path_factory.mktemp("media")
    seed_env = {"SEED_DEFAULT_PASSWORD": "seed-test-only"}
    with django_db_blocker.unblock(), override_settings(MEDIA_ROOT=str(media)), \
            mock.patch.dict(os.environ, seed_env):
        call_command("seed", stdout=io.StringIO())
    yield
    with django_db_blocker.unblock():
        call_command("flush", interactive=False, stdout=io.StringIO())


def test_every_demo_ticket_is_at_its_requesters_own_campus(seeded):
    tickets = Ticket.objects.all()
    assert tickets.count() > 100

    assert not tickets.exclude(requester_campus=F("raised_by__campus")).exists()
    assert not tickets.exclude(facility__campus=F("requester_campus")).exists()
    assert not tickets.exclude(ticket_no__contains=F("requester_campus__code")).exists()


def test_a_held_demo_ticket_is_paused_after_work_started(seeded):
    from apps.tickets.models import TicketLog

    for ticket in Ticket.objects.filter(status="pending"):
        started = TicketLog.objects.get(ticket=ticket, to_value="in_progress").created_at
        held = TicketLog.objects.get(ticket=ticket, to_value="pending").created_at
        assert started <= held, ticket.ticket_no


def test_every_rated_demo_ticket_is_closed(seeded):
    rated = Ticket.objects.filter(rated_at__isnull=False)
    assert rated.exists()
    assert set(rated.values_list("status", flat=True)) == {"closed"}


def test_a_demo_requester_hears_of_a_comment_only_once_they_may_read_it(seeded):
    """Requesters read comments while held or resolved, so that is when they hear."""
    from apps.notifications.models import Notification

    told = Notification.objects.filter(event_type="comment_added").select_related("ticket")
    to_requesters = [n for n in told if n.ticket and n.user_id == n.ticket.raised_by_id]
    assert to_requesters, "the seed holds requester-readable comments"
    for n in to_requesters:
        held = n.ticket.paused_at is not None and n.created_at >= n.ticket.paused_at
        settled = n.ticket.resolved_at is not None and n.created_at >= n.ticket.resolved_at
        assert held or settled, n.ticket.ticket_no


def test_a_demo_handover_note_reaches_the_technician_only(seeded):
    from apps.notifications.models import Notification

    handed = Notification.objects.filter(event_type="ticket_assigned").exclude(note="")
    assert handed.exists()
    for n in handed.select_related("ticket"):
        assert n.user_id == n.ticket.assigned_to_id, n.ticket.ticket_no


def test_every_demo_priority_above_low_was_set_by_the_hos_as_they_assigned_it(seeded):
    """`assign_ticket` writes the priority change just before the assignment."""
    from datetime import timedelta

    from apps.tickets.models import TicketLog

    raised = Ticket.objects.exclude(priority__name="Low").exclude(status="open")
    assert raised.exists()
    for ticket in raised:
        change = TicketLog.objects.get(ticket=ticket, event_type="priority_changed")
        assert (change.from_value, change.to_value) == ("Low", ticket.priority.name)
        assert change.actor.role_assignment.role == "hos", ticket.ticket_no
        assigned = TicketLog.objects.get(ticket=ticket, event_type="assigned")
        assert assigned.actor_id == change.actor_id, ticket.ticket_no
        assert assigned.created_at - change.created_at == timedelta(seconds=1)


def test_a_demo_claim_is_one_moment_that_ends_in_progress(seeded):
    """`claim_ticket` logs the assignment and both hops together, and never stops at assigned."""
    from apps.tickets.models import TicketLog

    # A claim is the one assignment its own technician makes.
    assignments = TicketLog.objects.filter(event_type="assigned").select_related("ticket")
    claims = [a for a in assignments if a.actor_id == a.ticket.assigned_to_id]
    assert claims
    for claim in claims:
        hops = TicketLog.objects.filter(
            ticket=claim.ticket, event_type="status_changed", created_at=claim.created_at,
        ).values_list("from_value", "to_value")
        assert set(hops) == {("open", "assigned"), ("assigned", "in_progress")}, claim.ticket.ticket_no
        assert claim.ticket.status != "assigned"
        assert claim.ticket.priority.name == "Low"


def test_every_demo_trail_runs_in_the_order_the_app_writes_it(seeded):
    """Raised, then assigned, then started, then held or resolved, then closed;
    every comment before the ticket settled."""
    from apps.tickets.models import TicketComment, TicketLog

    for ticket in Ticket.objects.all():
        logs = TicketLog.objects.filter(ticket=ticket)
        at = lambda **kw: logs.filter(**kw).values_list("created_at", flat=True).first()  # noqa: E731
        created = at(event_type="created")
        assigned = at(event_type="assigned")
        started = at(event_type="status_changed", to_value="in_progress")
        held = at(event_type="status_changed", to_value="pending")
        resolved = at(event_type="resolved")
        closed = at(event_type="closed")
        steps = [t for t in (created, assigned, started, held or resolved, closed) if t]
        assert steps == sorted(steps), ticket.ticket_no
        if ticket.resolved_at:
            assert started and ticket.resolved_at > started, ticket.ticket_no
            late = TicketComment.objects.filter(ticket=ticket, created_at__gt=ticket.resolved_at)
            assert not late.exists(), ticket.ticket_no
