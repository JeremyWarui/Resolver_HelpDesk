"""The demo data `seed` writes follows the same routing rules as the API."""

import io

import pytest
from django.core.management import call_command
from django.db.models import F

from apps.tickets.models import Ticket

pytestmark = pytest.mark.django_db


@pytest.fixture
def seeded(monkeypatch, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    monkeypatch.setenv("SEED_DEFAULT_PASSWORD", "seed-test-only")
    call_command("seed", stdout=io.StringIO())


def test_every_demo_ticket_is_at_its_requesters_own_campus(seeded):
    tickets = Ticket.objects.all()
    assert tickets.count() > 100

    assert not tickets.exclude(requester_campus=F("raised_by__campus")).exists()
    assert not tickets.exclude(facility__campus=F("requester_campus")).exists()
    assert not tickets.exclude(ticket_no__contains=F("requester_campus__code")).exists()


def test_some_demo_escalations_reach_the_hod(seeded):
    assert Ticket.objects.filter(current_level="hod").exists()
    assert Ticket.objects.filter(current_level="hos").exists()


def test_most_old_staffed_demo_work_is_finished(seeded):
    """A backlog of two-month-old open jobs would make overdue the whole story,
    and leave a campus too few finished tickets for an SLA figure to mean much."""
    from datetime import timedelta

    from django.utils import timezone

    from apps.common.management.commands.seed import SETTLED_AFTER_DAYS
    from apps.tickets.constants import TERMINAL_STATUSES

    old = Ticket.objects.filter(
        created_at__lt=timezone.now() - timedelta(days=SETTLED_AFTER_DAYS),
        assigned_to__isnull=False,
    )
    assert old.count() > 20
    assert old.filter(status__in=TERMINAL_STATUSES).count() / old.count() > 0.75


def test_demo_work_includes_late_finishes(seeded):
    """Otherwise every SLA figure reads 100%."""
    from apps.tickets.sla import q_met, q_settled_with_due

    measurable = Ticket.objects.filter(q_settled_with_due()).count()
    met = Ticket.objects.filter(q_met()).count()
    assert 0 < met < measurable


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


def test_every_demo_resolution_message_carries_its_note(seeded):
    from apps.notifications.models import Notification

    resolved = Notification.objects.filter(event_type="ticket_resolved")
    assert resolved.exists()
    assert not resolved.filter(note="").exists()
