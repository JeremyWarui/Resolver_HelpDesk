"""Notifications — generated on the backend, fetched by polling.

These rows are the only record that something happened, so the tests that
matter are the ones proving each domain event writes them, and to the right
people: a notification nobody receives is the same as no notification at all.
"""

import pytest
from django.urls import reverse

from apps.notifications.models import Notification
from tests import factories

pytestmark = pytest.mark.django_db


def _for(user, event=None):
    qs = Notification.objects.filter(user=user)
    return qs.filter(event_type=event) if event else qs


def test_raising_a_ticket_tells_the_supervisors(
    api,
    requester,
    nrb,
    electrical,
    nrb_hos,
    nrb_hod,
    priorities,
    somewhere,
):
    from tests import factories

    item = factories.make_service_item(electrical, "Dead socket")
    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"),
        {"service_item": item.pk, "description": "no power", "location": somewhere},
        format="json",
    )
    assert response.status_code == 201, response.json()

    assert _for(nrb_hos, "ticket_created").exists()
    assert _for(nrb_hod, "ticket_created").exists()
    # The requester already knows — they just filed it.
    assert not _for(requester, "ticket_created").exists()


def test_assigning_tells_the_technician_and_the_requester(
    api,
    nrb_hos,
    nrb_electrician,
    nrb_electrical_ticket,
    requester,
):
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )
    assert response.status_code == 200, response.json()

    assert _for(nrb_electrician, "ticket_assigned").exists()
    assert _for(requester, "ticket_assigned").exists()


def test_the_feed_is_the_callers_own(api, requester, nrb_hos, nrb_electrical_ticket):
    Notification.objects.create(
        user=nrb_hos, event_type="ticket_created", title="t", body="b"
    )
    api.force_authenticate(requester)
    body = api.get(reverse("notifications-list")).json()
    assert body["results"] == []
    assert body["unread_count"] == 0


def test_another_users_notification_cannot_be_marked_read(api, requester, nrb_hos):
    theirs = Notification.objects.create(
        user=nrb_hos, event_type="ticket_created", title="t", body="b"
    )
    api.force_authenticate(requester)
    # reverse(), not a literal path: a slashless literal asserts against
    # APPEND_SLASH's 301 instead of the 404 the view returns.
    url = reverse("notification-mark-read", args=[theirs.pk])
    assert api.patch(url).status_code == 404
    theirs.refresh_from_db()
    assert theirs.read is False



def test_a_comment_never_reaches_the_requester(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, requester
):
    """The requester is refused the comment thread, so the feed must not hand
    them the body it withholds — this once shipped a 100-character preview."""
    from apps.notifications.notify import emit_comment_added
    from apps.tickets.models import TicketComment

    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.save(update_fields=["assigned_to"])
    comment = TicketComment.objects.create(
        ticket=nrb_electrical_ticket, author=nrb_hos, body="chase the store"
    )

    emit_comment_added(nrb_electrical_ticket, comment)

    assert not _for(requester, "comment_added").exists()
    # The assignee is who a comment on their job concerns.
    assert _for(nrb_electrician, "comment_added").count() == 1


def test_a_status_change_tells_the_requester(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, requester
):
    """The requester never reaches the comment thread, so a status change is
    how they learn the work moved."""
    from apps.tickets.lifecycle import assign_ticket, transition_status

    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    transition_status(nrb_electrical_ticket, "in_progress", nrb_electrician)

    assert _for(requester, "ticket_status_changed").count() == 1


def test_resolving_tells_the_requester_and_asks_for_a_rating(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, requester
):
    """Resolved is its own event, not another status change: it is the one that
    asks for the rating, and the rating only exists after resolution."""
    from apps.tickets.lifecycle import assign_ticket, transition_status

    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    transition_status(nrb_electrical_ticket, "in_progress", nrb_electrician)
    transition_status(nrb_electrical_ticket, "resolved", nrb_electrician)

    assert _for(requester, "ticket_resolved").count() == 1
    # Resolution is not also announced as a plain status change.
    assert _for(requester, "ticket_status_changed").count() == 1


def test_reassignment_tells_the_technician_who_lost_the_job(
    nrb, electrical, nrb_electrical_ticket, nrb_hos, requester
):
    """The outgoing technician has the job on their queue and has to be told it
    is gone, or they keep working a ticket that is no longer theirs."""
    from apps.tickets.lifecycle import assign_ticket

    first = factories.make_technician("elec_first", nrb, [electrical])
    second = factories.make_technician("elec_second", nrb, [electrical])

    assign_ticket(nrb_electrical_ticket, first, nrb_hos)
    assert _for(first, "ticket_assigned").count() == 1

    assign_ticket(nrb_electrical_ticket, second, nrb_hos)

    assert _for(second, "ticket_assigned").count() == 1
    assert _for(first, "ticket_assigned").count() == 2
    assert _for(requester, "ticket_assigned").count() == 2


def test_an_sla_breach_tells_the_supervisors_not_the_technician(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, nrb_hod, requester
):
    """By the time this fires the deadline is gone and the decision — reassign,
    chase, reprioritise — belongs to the supervisors. Driven through the
    command, because cron is the only thing that ever calls the emitter."""
    from datetime import timedelta

    from django.core.management import call_command
    from django.utils import timezone

    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "in_progress"
    nrb_electrical_ticket.resolution_due_at = timezone.now() - timedelta(hours=1)
    nrb_electrical_ticket.save(
        update_fields=["assigned_to", "status", "resolution_due_at"]
    )

    call_command("check_sla")

    assert _for(nrb_hos, "sla_breach").count() == 1
    assert _for(nrb_hod, "sla_breach").count() == 1
    assert not _for(nrb_electrician, "sla_breach").exists()
    assert not _for(requester, "sla_breach").exists()

    # The command is idempotent, so a second pass must not notify twice.
    call_command("check_sla")
    assert _for(nrb_hos, "sla_breach").count() == 1


def test_an_escalation_tells_the_post_it_reached_and_the_assignee(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, nrb_hod
):
    """Both halves matter: the HOS has to know it landed on them, and the
    technician has to know the job left their level."""
    from django.utils import timezone

    from apps.tickets.escalation import run_escalation_for_ticket

    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "in_progress"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])
    factories.age_ticket(
        nrb_electrical_ticket,
        minutes=nrb_electrical_ticket.priority.escalate_to_hos_minutes + 1,
    )

    assert run_escalation_for_ticket(nrb_electrical_ticket, timezone.now()) is True

    assert _for(nrb_hos, "ticket_escalated").count() == 1
    assert _for(nrb_electrician, "ticket_escalated").count() == 1
    # It reached the HOS, not the HOD — the level above has not been passed.
    assert not _for(nrb_hod, "ticket_escalated").exists()


def test_a_failing_notification_never_breaks_the_action(
    monkeypatch, nrb_electrical_ticket, nrb_electrician, nrb_hos
):
    """The row is the courtesy, the ticket is the work. The guard sits at the
    emitter boundary, so it has to hold for an error raised before the insert
    as well as inside it."""
    from apps.notifications import notify
    from apps.tickets.lifecycle import assign_ticket, transition_status

    def explode(*args, **kwargs):
        raise RuntimeError("the feed is down")

    monkeypatch.setattr(notify, "_notify_users", explode)

    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    transition_status(nrb_electrical_ticket, "in_progress", nrb_electrician)

    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.status == "in_progress"
    assert nrb_electrical_ticket.assigned_to_id == nrb_electrician.pk
    assert Notification.objects.count() == 0
