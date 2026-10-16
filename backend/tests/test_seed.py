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


def test_every_demo_description_is_in_the_requesters_words(seeded):
    from apps.common.management.commands.seed import DESCRIPTIONS

    for item, description in Ticket.objects.values_list("service_item__name", "description"):
        assert description in DESCRIPTIONS[item], (item, description)


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


def test_demo_ratings_span_the_scale_and_comments_match_their_stars(seeded):
    from apps.common.management.commands.seed import RATING_COMMENTS

    rated = Ticket.objects.exclude(rating=None)
    assert {2, 5} <= set(rated.values_list("rating", flat=True))
    commented = rated.exclude(rating_comment="")
    assert commented.exists() and rated.filter(rating_comment="").exists()
    for rating, comment in commented.values_list("rating", "rating_comment"):
        assert comment in RATING_COMMENTS[rating]


def test_old_demo_messages_are_read_and_recent_ones_wait(seeded):
    from datetime import timedelta

    from django.utils import timezone

    from apps.common.management.commands.seed import READ_AFTER_DAYS
    from apps.notifications.models import Notification

    cutoff = timezone.now() - timedelta(days=READ_AFTER_DAYS)
    assert not Notification.objects.filter(created_at__lt=cutoff, read=False).exists()
    assert Notification.objects.filter(created_at__gte=cutoff, read=False).exists()


def test_demo_system_feedback_carries_each_authors_role(seeded):
    from apps.system_feedback.models import SystemFeedback

    entries = SystemFeedback.objects.select_related("author__role_assignment")
    assert {e.category for e in entries} == {c for c, _ in SystemFeedback.CATEGORIES}
    assert {e.reviewed for e in entries} == {True, False}
    for e in entries:
        assert e.author_role == e.author.role_assignment.role


def test_most_live_demo_work_is_still_with_its_technician(seeded):
    """Escalation is the exception: a demo where every live job sits with the
    HOD shows a desk on fire, and empty My Jobs pages."""
    from apps.tickets.constants import TERMINAL_STATUSES

    live = Ticket.objects.exclude(status__in=TERMINAL_STATUSES).exclude(assigned_to=None)
    assert live.count() >= 30
    assert live.filter(current_level="technician").count() / live.count() > 0.6
    assert live.filter(current_level="hod").exists()


def test_a_demo_tickets_updated_at_is_its_last_event(seeded):
    from django.db.models import Max

    from apps.tickets.models import TicketLog

    last = dict(
        TicketLog.objects.order_by().values_list("ticket").annotate(at=Max("created_at"))
    )
    for pk, updated_at in Ticket.objects.values_list("pk", "updated_at"):
        assert updated_at == last[pk], pk


def test_no_demo_fix_waits_months_for_its_rating(seeded):
    from datetime import timedelta

    from django.utils import timezone

    from apps.common.management.commands.seed import SETTLED_AFTER_DAYS

    unrated = Ticket.objects.filter(status="resolved")
    assert unrated.exists()
    assert not unrated.filter(
        created_at__lt=timezone.now() - timedelta(days=SETTLED_AFTER_DAYS)
    ).exists()


def test_a_demo_escalation_and_its_messages_are_dated_when_the_threshold_was_crossed(seeded):
    """The engine stamps what it does with the moment it runs; the seed moves
    each step back to when its ticket crossed the threshold."""
    from datetime import timedelta

    from apps.notifications.models import Notification
    from apps.tickets.escalation import thresholds
    from apps.tickets.models import TicketLog

    steps = TicketLog.objects.filter(event_type="escalated").select_related("ticket__priority")
    assert steps.exists()
    for log in steps:
        t = log.ticket
        crossed = t.clock_started_at + t.accumulated_pause + timedelta(
            minutes=dict(thresholds(t.priority))[log.to_value]
        )
        assert log.created_at <= crossed, t.ticket_no
        told = Notification.objects.filter(
            ticket=t, event_type="ticket_escalated", body__icontains=log.to_value,
        )
        assert told.exists() and set(told.values_list("created_at", flat=True)) == {log.created_at}


def test_demo_work_is_not_bunched_at_the_moment_of_seeding(seeded):
    from datetime import timedelta

    from django.utils import timezone

    from apps.notifications.models import Notification
    from apps.tickets.models import TicketLog

    since = timezone.now() - timedelta(minutes=5)
    assert Ticket.objects.filter(updated_at__gte=since).count() <= 2
    assert TicketLog.objects.filter(created_at__gte=since).count() <= 4
    assert Notification.objects.filter(created_at__gte=since).count() <= 6
