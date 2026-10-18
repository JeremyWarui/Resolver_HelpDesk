"""Status transitions, the SLA clock, and who may drive them.

`open` means unassigned, so reopen clears the assignee — claim and assign both
rely on it. `pending` freezes the SLA clock.
"""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.tickets.models import Ticket, TicketLog
from tests import factories
from apps.tickets.lifecycle import (
    TransitionError,
    assign_ticket,
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


@pytest.mark.parametrize("settled", ["resolved", "closed"])
def test_reopen_drops_the_ticket_back_to_the_technician_level(
    assigned_ticket, nrb_electrician, nrb_hos, nrb_hod, settled
):
    """A reopened ticket starts over; one that had reached the HOD must not sit
    on the HOD's escalated list from the moment it reopens."""
    path = ("in_progress", "resolved") + (("closed",) if settled == "closed" else ())
    advance(assigned_ticket, *path, actor=nrb_electrician)
    Ticket.objects.filter(pk=assigned_ticket.pk).update(current_level="hod")
    assigned_ticket.refresh_from_db()

    transition_status(assigned_ticket, "open", actor=nrb_electrician)
    assigned_ticket.refresh_from_db()

    assert assigned_ticket.current_level == "technician"
    assert factories.escalate(assigned_ticket, timezone.now()) is False


def test_a_reopened_ticket_escalates_on_its_new_clock_not_its_first(
    assigned_ticket, nrb_electrician, nrb_hos
):
    """Raised a week ago and reopened now: the escalation timer starts at the
    reopen, the same moment the SLA deadlines restart from."""
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    factories.age_ticket(assigned_ticket, days=7)

    transition_status(assigned_ticket, "open", actor=nrb_electrician)
    assigned_ticket.refresh_from_db()

    assert timezone.now() - assigned_ticket.clock_started_at < timedelta(minutes=1)
    assert factories.escalate(assigned_ticket, timezone.now()) is False

    hos_minutes = assigned_ticket.priority.escalate_to_hos_minutes
    later = timezone.now() + timedelta(minutes=hos_minutes + 1)
    assert factories.escalate(assigned_ticket, later) is True
    assert assigned_ticket.current_level == "hos"


def test_a_priority_set_after_a_reopen_measures_from_the_reopen(
    assigned_ticket, nrb_electrician, nrb_hos, critical_priority
):
    """Measured from the original raise, a week-old reopened ticket would get
    deadlines already in the past."""
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    factories.age_ticket(assigned_ticket, days=7)
    transition_status(assigned_ticket, "open", actor=nrb_electrician)
    assigned_ticket.refresh_from_db()

    assign_ticket(assigned_ticket, nrb_electrician, nrb_hos, priority=critical_priority)

    assert assigned_ticket.resolution_due_at == assigned_ticket.clock_started_at + (
        timedelta(minutes=critical_priority.resolution_minutes)
    )
    assert assigned_ticket.resolution_due_at > timezone.now()


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


def test_a_posted_comment_keeps_its_text(api, assigned_ticket, nrb_electrician):
    api.force_authenticate(nrb_electrician)
    response = _post_comment(api, assigned_ticket, "  Isolated the circuit  ")

    assert response.status_code == 201
    assert response.json()["body"] == "Isolated the circuit"
    rows = api.get(reverse("ticket-comments", args=[assigned_ticket.pk])).json()["results"]
    assert [r["body"] for r in rows] == ["Isolated the circuit"]


@pytest.mark.parametrize("body", ["", "   "])
def test_an_empty_comment_is_refused(api, assigned_ticket, nrb_electrician, body):
    api.force_authenticate(nrb_electrician)
    assert _post_comment(api, assigned_ticket, body).status_code == 400
    assert assigned_ticket.comments.count() == 0


def test_comments_are_closed_until_a_technician_is_assigned(
    api, nrb_electrical_ticket, nrb_hos
):
    """The thread is the working log of a job in hand. Before anyone holds the
    job there is no work to log, and the HOS is the caller who could otherwise
    open it: they may comment on any ticket at their campus."""
    api.force_authenticate(nrb_hos)
    assert _post_comment(api, nrb_electrical_ticket).status_code == 400
    assert nrb_electrical_ticket.comments.count() == 0


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
    bystander = factories.make_technician("third_elec", nrb, [electrical])
    api.force_authenticate(bystander)
    assert _post_comment(api, assigned_ticket).status_code == 403


@pytest.mark.parametrize(
    "status", ["open", "assigned", "in_progress", "pending", "resolved", "closed"]
)
def test_the_requester_may_never_comment_on_their_own_ticket(
    api, assigned_ticket, requester, status
):
    Ticket.objects.filter(pk=assigned_ticket.pk).update(status=status)
    api.force_authenticate(requester)
    assert _post_comment(api, assigned_ticket).status_code == 403
    assert assigned_ticket.comments.count() == 0


@pytest.mark.parametrize(
    "status, readable",
    [
        ("open", False),
        ("assigned", False),
        ("in_progress", False),
        ("pending", True),
        ("resolved", True),
        ("closed", False),
    ],
)
def test_the_requester_reads_the_comments_only_while_pending_or_resolved(
    api, assigned_ticket, nrb_electrician, requester, status, readable
):
    from apps.tickets.models import TicketComment

    TicketComment.objects.create(
        ticket=assigned_ticket, author=nrb_electrician, body="Hinge set ordered"
    )
    Ticket.objects.filter(pk=assigned_ticket.pk).update(status=status)

    api.force_authenticate(requester)
    response = api.get(reverse("ticket-comments", args=[assigned_ticket.pk]))

    if readable:
        assert response.status_code == 200
        assert [c["body"] for c in response.json()["results"]] == ["Hinge set ordered"]
    else:
        assert response.status_code == 403


def test_a_technician_who_raised_and_claimed_a_job_keeps_its_working_log(
    api, nrb, electrical, nrb_electrician, priorities
):
    """Reporting a fault in your own trade does not lock you out of fixing it."""
    own = factories.make_ticket(nrb_electrician, nrb, electrical)
    api.force_authenticate(nrb_electrician)
    assert api.post(reverse("ticket-claim", args=[own.pk])).status_code == 200

    assert _post_comment(api, own, "Isolated the circuit").status_code == 201
    response = api.get(reverse("ticket-comments", args=[own.pk]))
    assert response.status_code == 200
    assert api.get(reverse("ticket-detail", args=[own.pk])).json()[
        "viewer_is_requester"
    ] is False


def test_an_hos_who_raised_a_ticket_on_their_campus_reads_its_log(
    api, nrb, electrical, nrb_hos, nrb_electrician, priorities
):
    own = factories.make_ticket(nrb_hos, nrb, electrical)
    own.assigned_to = nrb_electrician
    own.status = "in_progress"
    own.save(update_fields=["assigned_to", "status"])

    api.force_authenticate(nrb_hos)
    assert api.get(reverse("ticket-comments", args=[own.pk])).status_code == 200
    assert _post_comment(api, own, "Chase stores").status_code == 201


def test_a_technician_who_raised_a_job_outside_their_trade_is_its_requester(
    api, nrb, plumbing, nrb_electrician, nrb_plumber, priorities
):
    """Out of their scope, the electrician is just the person who reported it."""
    own = factories.make_ticket(nrb_electrician, nrb, plumbing)
    own.assigned_to = nrb_plumber
    own.status = "in_progress"
    own.save(update_fields=["assigned_to", "status"])

    api.force_authenticate(nrb_electrician)
    assert api.get(reverse("ticket-comments", args=[own.pk])).status_code == 403
    assert _post_comment(api, own).status_code == 403
    assert api.get(reverse("ticket-detail", args=[own.pk])).json()[
        "viewer_is_requester"
    ] is True


def test_a_requester_cannot_read_comments_on_someone_elses_ticket(
    api, assigned_ticket, msa_requester
):
    Ticket.objects.filter(pk=assigned_ticket.pk).update(status="pending")
    api.force_authenticate(msa_requester)
    response = api.get(reverse("ticket-comments", args=[assigned_ticket.pk]))
    assert response.status_code == 403


def test_a_manager_may_not_comment(api, assigned_ticket, manager):
    api.force_authenticate(manager)
    assert _post_comment(api, assigned_ticket).status_code == 403


def test_the_requester_sees_the_trail_of_their_own_ticket(
    api, assigned_ticket, nrb_electrician, requester
):
    """The timeline shows the requester what happened to the job, at every status."""
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
    """The trail shows status changes; comments are read on their own thread."""
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


def _resolved(ticket, technician):
    ticket.assigned_to = technician
    ticket.save(update_fields=["assigned_to"])
    for status in ("assigned", "in_progress", "resolved"):
        transition_status(ticket, status, technician)
    return ticket


def test_rating_a_resolved_ticket_closes_it(
    api, requester, nrb_electrician, nrb_electrical_ticket
):
    """A rated ticket is never left resolved, so it is never offered for rating again."""
    t = _resolved(nrb_electrical_ticket, nrb_electrician)

    api.force_authenticate(requester)
    response = _rate(api, t, rating=4)

    assert response.status_code == 201
    assert response.json()["status"] == "closed"
    t.refresh_from_db()
    assert (t.status, t.rating) == ("closed", 4)
    assert t.closed_at is not None
    events = list(
        TicketLog.objects.filter(ticket=t).order_by("created_at", "id")
        .values_list("event_type", flat=True)
    )
    assert events[-2:] == ["rated", "closed"]


def test_a_ticket_closed_without_a_rating_can_still_be_rated(
    api, requester, nrb_electrician, nrb_electrical_ticket
):
    t = _resolved(nrb_electrical_ticket, nrb_electrician)
    transition_status(t, "closed", requester)

    api.force_authenticate(requester)
    assert _rate(api, t, rating=3).status_code == 201
    t.refresh_from_db()
    assert (t.status, t.rating) == ("closed", 3)


def test_a_failed_close_leaves_no_rating_behind(
    api, requester, nrb_electrician, nrb_electrical_ticket, monkeypatch
):
    """The rating and the close are one transaction."""
    from apps.tickets import lifecycle

    t = _resolved(nrb_electrical_ticket, nrb_electrician)

    def broken_close(*args, **kwargs):
        raise RuntimeError("close failed")

    monkeypatch.setattr(lifecycle, "transition_status", broken_close)
    api.force_authenticate(requester)
    api.raise_request_exception = False
    assert _rate(api, t, rating=5).status_code == 500

    t.refresh_from_db()
    assert (t.status, t.rated_at) == ("resolved", None)
    assert not TicketLog.objects.filter(ticket=t, event_type="rated").exists()


def test_reopening_clears_the_rating_so_the_next_fix_can_be_rated(
    api, requester, nrb_electrician, nrb_electrical_ticket
):
    t = _resolved(nrb_electrical_ticket, nrb_electrician)
    api.force_authenticate(requester)
    assert _rate(api, t, rating=2).status_code == 201

    t.refresh_from_db()
    transition_status(t, "open", requester)
    t.refresh_from_db()
    assert (t.rating, t.rated_at) == (None, None)
    assert TicketLog.objects.filter(ticket=t, event_type="rated").count() == 1

    _resolved(t, nrb_electrician)
    assert _rate(api, t, rating=5).status_code == 201


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


def test_a_settled_ticket_cannot_be_assigned(
    api,
    nrb_hos,
    nrb_electrician,
    nrb_electrical_ticket,
):
    """Assignment is for live work. A finished ticket is reopened, not handed on.

    A settled ticket has already been judged against `resolved_at`. Assigning
    one names a technician for a job that is over and notifies them about it;
    with a priority attached it also re-bases both due dates underneath a
    verdict already reached.
    """
    ticket = nrb_electrical_ticket
    ticket.status = "closed"
    ticket.save(update_fields=["status"])

    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[ticket.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )

    assert response.status_code == 400
    assert "Reopen it first" in response.data["detail"]
    ticket.refresh_from_db()
    assert ticket.assigned_to_id is None
    assert ticket.status == "closed"
    assert not ticket.logs.filter(event_type__in=("assigned", "reassigned")).exists()



@pytest.mark.parametrize(
    "status, resolved_offset, due_offset, outcome",
    [
        ("closed", -2, -1, "met"),       # finished an hour before the target
        ("closed", -1, -2, "missed"),    # finished an hour after it
        ("in_progress", None, -1, "overdue"),
        ("in_progress", None, 5, None),
    ],
)
def test_the_detail_carries_the_sla_verdict_from_tickets_sla(
    api, requester, nrb, electrical, priorities, status, resolved_offset, due_offset, outcome
):


    now = timezone.now()
    ticket = factories.make_ticket(requester, nrb, electrical)
    type(ticket).objects.filter(pk=ticket.pk).update(
        status=status,
        resolution_due_at=now + timedelta(hours=due_offset),
        resolved_at=None if resolved_offset is None else now + timedelta(hours=resolved_offset),
    )
    api.force_authenticate(requester)

    body = api.get(reverse("ticket-detail", args=[ticket.pk])).json()

    assert body["sla_outcome"] == outcome
