"""Status transitions, the SLA clock, and who may drive them.

`open` means unassigned, so reopen clears the assignee — claim and assign both
rely on it. `pending` freezes the SLA clock.
"""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.tickets.models import TicketLog
from tests import factories
from apps.tickets.lifecycle import (
    TransitionError,
    transition_status,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def assigned_ticket(nrb_electrical_ticket, nrb_electrician):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "assigned"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])
    return nrb_electrical_ticket


def advance(ticket, *statuses, actor=None, reason=""):
    for status in statuses:
        transition_status(ticket, status, actor=actor, reason=reason)
    return ticket


@pytest.mark.parametrize(
    "current,target",
    [
        ("open", "resolved"),  # cannot skip the work
        ("open", "in_progress"),
        ("assigned", "closed"),
        ("in_progress", "open"),  # reopen is only from resolved/closed
        ("closed", "resolved"),
        ("pending", "closed"),
    ],
)
def test_illegal_transitions_are_refused(assigned_ticket, current, target):
    assigned_ticket.status = current
    assigned_ticket.save(update_fields=["status"])
    with pytest.raises(TransitionError):
        transition_status(assigned_ticket, target, actor=None)


def test_pending_requires_a_reason(assigned_ticket, nrb_electrician):
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    with pytest.raises(TransitionError):
        transition_status(assigned_ticket, "pending", actor=nrb_electrician)


def test_pending_reason_must_be_one_of_the_codes(assigned_ticket, nrb_electrician):
    """A hold names one of the six codes, never free prose."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    with pytest.raises(TransitionError):
        transition_status(
            assigned_ticket,
            "pending",
            actor=nrb_electrician,
            pending_reason="waiting for the pump",
        )


def test_the_reason_is_cleared_when_work_resumes(assigned_ticket, nrb_electrician):
    """A stale reason on a running ticket would count as blocked work forever."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="material_not_in_store",
        pending_reason_note="Replacement pump.",
    )
    assert assigned_ticket.pending_reason == "material_not_in_store"

    transition_status(assigned_ticket, "in_progress", actor=nrb_electrician)

    assigned_ticket.refresh_from_db()
    assert assigned_ticket.pending_reason == ""
    assert assigned_ticket.pending_reason_note == ""


def test_pending_freezes_the_clock(assigned_ticket, nrb_electrician):
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="material_not_in_store",
    )
    assert assigned_ticket.paused_at is not None


def test_resuming_pushes_the_deadline_out_by_the_paused_time(
    assigned_ticket,
    nrb_electrician,
):
    """A ticket parked for two days must not owe those two days back."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="material_not_in_store",
    )

    paused_for = timedelta(days=2)
    assigned_ticket.paused_at = timezone.now() - paused_for
    original_due = assigned_ticket.resolution_due_at
    assigned_ticket.save(update_fields=["paused_at"])

    transition_status(assigned_ticket, "in_progress", actor=nrb_electrician)

    assert assigned_ticket.paused_at is None
    assert assigned_ticket.accumulated_pause >= paused_for
    # Within a second — `now` moves between the two calls.
    assert abs(
        (assigned_ticket.resolution_due_at - original_due) - paused_for
    ) < timedelta(seconds=5)


def test_resolving_stamps_resolved_at(assigned_ticket, nrb_electrician):
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    assert assigned_ticket.resolved_at is not None


def test_reopen_clears_the_assignee(assigned_ticket, nrb_electrician):
    """`open` is the unassigned state — claim and assign both depend on it."""
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    transition_status(assigned_ticket, "open", actor=nrb_electrician)

    assert assigned_ticket.status == "open"
    assert assigned_ticket.assigned_to_id is None


def test_reopen_restarts_the_sla_and_drops_stale_timestamps(
    assigned_ticket,
    nrb_electrician,
):
    """Leaving resolved_at set on a live ticket would corrupt both the breach
    flag and every resolved-time metric."""
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    resolved_due = assigned_ticket.resolution_due_at

    transition_status(assigned_ticket, "open", actor=nrb_electrician)

    assert assigned_ticket.resolved_at is None
    assert assigned_ticket.closed_at is None
    assert assigned_ticket.paused_at is None
    assert assigned_ticket.accumulated_pause == timedelta(0)
    assert assigned_ticket.resolution_due_at > resolved_due


def _post_status(api, ticket, status, **extra):
    return api.post(
        reverse("ticket-status", args=[ticket.pk]),
        {"status": status, **extra},
        format="json",
    )


def test_assigned_technician_may_progress_their_own_ticket(
    api,
    assigned_ticket,
    nrb_electrician,
):
    api.force_authenticate(nrb_electrician)
    assert _post_status(api, assigned_ticket, "in_progress").status_code == 200


def test_technician_may_not_progress_someone_elses_ticket(
    api,
    assigned_ticket,
    nrb,
    electrical,
):
    """Campus scope grants sight of a ticket, not authority over it."""
    from tests import factories

    bystander = factories.make_technician("second_elec", nrb, [electrical])
    api.force_authenticate(bystander)
    assert _post_status(api, assigned_ticket, "in_progress").status_code == 403


def test_hos_may_progress_any_ticket_at_their_campus(api, assigned_ticket, nrb_hos):
    api.force_authenticate(nrb_hos)
    assert _post_status(api, assigned_ticket, "in_progress").status_code == 200


def test_requester_may_close_their_own_resolved_ticket(
    api,
    assigned_ticket,
    nrb_electrician,
    requester,
):
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    api.force_authenticate(requester)
    assert _post_status(api, assigned_ticket, "closed").status_code == 200


def test_requester_may_reopen_their_own_ticket(
    api,
    assigned_ticket,
    nrb_electrician,
    requester,
):
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    api.force_authenticate(requester)
    assert _post_status(api, assigned_ticket, "open").status_code == 200


def test_requester_may_not_drive_the_work_itself(api, assigned_ticket, requester):
    """Close and reopen only — a requester cannot mark their own job done."""
    api.force_authenticate(requester)
    assert _post_status(api, assigned_ticket, "in_progress").status_code == 403


def _post_comment(api, ticket, body="hello"):
    return api.post(
        reverse("ticket-comments", args=[ticket.pk]), {"body": body}, format="json"
    )


def test_comments_open_once_assigned(api, assigned_ticket, nrb_electrician):
    api.force_authenticate(nrb_electrician)
    assert _post_comment(api, assigned_ticket).status_code == 201


def test_comments_close_permanently_when_the_ticket_closes(
    api,
    assigned_ticket,
    nrb_electrician,
):
    advance(assigned_ticket, "in_progress", "resolved", "closed", actor=nrb_electrician)
    api.force_authenticate(nrb_electrician)
    assert _post_comment(api, assigned_ticket).status_code == 400


def test_only_the_assignee_may_comment_among_technicians(
    api,
    assigned_ticket,
    nrb,
    electrical,
):
    from tests import factories

    bystander = factories.make_technician("third_elec", nrb, [electrical])
    api.force_authenticate(bystander)
    assert _post_comment(api, assigned_ticket).status_code == 403


def test_the_requester_may_not_comment_on_their_own_ticket(
    api,
    assigned_ticket,
    requester,
):
    """Comments are the staff working log. The requester is told what happened
    through status changes and notifications, not by joining the thread."""
    api.force_authenticate(requester)
    assert _post_comment(api, assigned_ticket).status_code == 403


def test_the_requester_may_not_read_the_comment_thread(
    api,
    assigned_ticket,
    nrb_electrician,
    requester,
):
    """Staff-only in both directions: withholding the write but serving the read
    would put every internal note in front of the person it is about."""
    from apps.tickets.models import TicketComment

    TicketComment.objects.create(
        ticket=assigned_ticket, author=nrb_electrician, body="needs a second visit"
    )

    api.force_authenticate(requester)
    response = api.get(reverse("ticket-comments", args=[assigned_ticket.pk]))
    assert response.status_code == 403


def test_a_manager_may_not_comment(api, assigned_ticket, manager):
    """Read-only oversight: a manager reads the ticket but never works it."""
    api.force_authenticate(manager)
    assert _post_comment(api, assigned_ticket).status_code == 403


def test_the_requester_sees_the_trail_of_their_own_ticket(
    api, assigned_ticket, nrb_electrician, requester
):
    """What the requester gets in place of comments: what happened to the job.

    Closing the comment thread must not close the timeline with it — otherwise
    the person who raised the ticket can no longer tell whether anyone touched
    it.
    """
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)

    api.force_authenticate(requester)
    response = api.get(reverse("ticket-logs", args=[assigned_ticket.pk]))

    assert response.status_code == 200
    rows = response.json()["results"]
    assert {row["event_type"] for row in rows} == {"status_changed", "resolved"}
    # Who did the work, not just that it happened.
    assert all(row["actor"]["id"] == nrb_electrician.pk for row in rows)


def test_the_requesters_trail_omits_the_staff_comment_events(
    api, assigned_ticket, nrb_electrician, requester
):
    """A "Comment added" row they can never open is a dead end pointing at a
    thread they are refused."""
    from apps.tickets.models import TicketLog

    TicketLog.objects.create(
        ticket=assigned_ticket,
        actor=nrb_electrician,
        event_type="comment_added",
        to_value="1",
    )

    api.force_authenticate(requester)
    rows = api.get(reverse("ticket-logs", args=[assigned_ticket.pk])).json()["results"]
    assert not any(row["event_type"] == "comment_added" for row in rows)

    # Staff still see the complete trail.
    api.force_authenticate(nrb_electrician)
    rows = api.get(reverse("ticket-logs", args=[assigned_ticket.pk])).json()["results"]
    assert any(row["event_type"] == "comment_added" for row in rows)


def _assign(api, ticket, technician, **extra):
    from django.urls import reverse

    return api.post(
        reverse("ticket-assign", args=[ticket.pk]),
        {"assigned_to": technician.pk, **extra},
        format="json",
    )


def _rate(api, ticket, **payload):
    return api.post(
        reverse("ticket-feedback", args=[ticket.pk]), payload, format="json"
    )


def test_the_requester_rates_their_resolved_ticket(
    api,
    requester,
    nrb_electrician,
    nrb_electrical_ticket,
):
    """The happy path: the requester rates their own resolved ticket, through
    the view's own fetch.
    """
    t = nrb_electrical_ticket
    t.assigned_to = nrb_electrician
    t.save(update_fields=["assigned_to"])
    transition_status(t, "assigned", nrb_electrician)
    transition_status(t, "in_progress", nrb_electrician)
    transition_status(t, "resolved", nrb_electrician)

    api.force_authenticate(requester)
    response = _rate(api, t, rating=5, comment="Same morning, sorted.")
    assert response.status_code == 201, response.content

    assert TicketLog.objects.filter(ticket=t, event_type="rated").get().to_value == "5"
    assert _rate(api, t, rating=1).status_code == 409


def test_only_the_requester_may_rate_it(
    api,
    requester,
    nrb_electrician,
    nrb_hos,
    nrb_electrical_ticket,
):
    """The IDOR guard only refuses callers out of scope. The technician who did
    the work and the HOS who assigned it are both fully in scope, and neither
    may grade the job — a rating is worth having because exactly one person
    can give it."""
    t = nrb_electrical_ticket
    t.assigned_to = nrb_electrician
    t.save(update_fields=["assigned_to"])
    transition_status(t, "assigned", nrb_electrician)
    transition_status(t, "in_progress", nrb_electrician)
    transition_status(t, "resolved", nrb_electrician)

    for actor in (nrb_electrician, nrb_hos):
        api.force_authenticate(actor)
        assert _rate(api, t, rating=5).status_code == 403


def test_an_unresolved_ticket_cannot_be_rated(api, requester, nrb_electrical_ticket):
    """Rating open work would measure an outcome that has not happened."""
    api.force_authenticate(requester)
    assert _rate(api, nrb_electrical_ticket, rating=5).status_code == 400


def _overdue_ids(api):
    response = api.get(reverse("ticket-list"), {"overdue": "1"})
    assert response.status_code == 200
    return {row["ticket_no"] for row in response.json()["results"]}
