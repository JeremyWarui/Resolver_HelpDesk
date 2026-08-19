"""Status transitions, the SLA clock, and who may drive them.

Two rules carry most of the weight here. `open` means *unassigned*, so reopen
has to clear the assignee — claim and assign both rely on that being true.
And `pending` freezes the SLA clock, so a ticket parked waiting for parts
cannot accrue a breach it did not earn.
"""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.tickets.models import TicketLog
from tests import factories
from apps.tickets.services.lifecycle import (
    ALLOWED,
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


# ── The transition map ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "current,target",
    [
        ("open", "resolved"),      # cannot skip the work
        ("open", "in_progress"),
        ("assigned", "closed"),
        ("in_progress", "open"),   # reopen is only from resolved/closed
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
    """Free text is what the old design collected, and it is what made "why is
    work stopped" unanswerable. Prose in this field is now refused."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    with pytest.raises(TransitionError):
        transition_status(
            assigned_ticket,
            "pending",
            actor=nrb_electrician,
            pending_reason="waiting for the pump",
        )


def test_other_requires_a_note(assigned_ticket, nrb_electrician):
    """`other` on its own carries no information — the note is the content."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    with pytest.raises(TransitionError):
        transition_status(
            assigned_ticket, "pending", actor=nrb_electrician, pending_reason="other"
        )

    transition_status(
        assigned_ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="other",
        pending_reason_note="The store key is with someone on leave.",
    )
    assert assigned_ticket.pending_reason == "other"


def test_the_reason_is_cleared_when_work_resumes(assigned_ticket, nrb_electrician):
    """A stale reason on a running ticket would count as blocked work forever."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="awaiting_materials",
        pending_reason_note="Replacement pump.",
    )
    assert assigned_ticket.pending_reason == "awaiting_materials"

    transition_status(assigned_ticket, "in_progress", actor=nrb_electrician)

    assigned_ticket.refresh_from_db()
    assert assigned_ticket.pending_reason == ""
    assert assigned_ticket.pending_reason_note == ""


def test_the_reason_survives_the_round_trip_to_the_database(
    assigned_ticket, nrb_electrician
):
    """`update_fields` is an explicit list — a field missing from it is written
    to the instance and silently dropped on the way to the table."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="awaiting_contractor",
        pending_reason_note="Lift engineer booked for Thursday.",
    )

    assigned_ticket.refresh_from_db()
    assert assigned_ticket.pending_reason == "awaiting_contractor"
    assert assigned_ticket.pending_reason_note == "Lift engineer booked for Thursday."


def test_the_hold_reads_as_prose_in_the_timeline(assigned_ticket, nrb_electrician):
    """The log is read by people, so it keeps the label — the code lives on the
    ticket for the machines."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="awaiting_materials",
        pending_reason_note="Replacement pump.",
    )

    log = TicketLog.objects.filter(ticket=assigned_ticket).order_by("-id").first()
    assert log.reason == "Materials not in store — Replacement pump."


def test_every_status_has_an_entry_in_the_map(assigned_ticket):
    """A status missing from ALLOWED is a dead end nothing can leave."""
    statuses = {value for value, _ in type(assigned_ticket).STATUS}
    assert statuses == set(ALLOWED)


# ── The SLA clock ─────────────────────────────────────────────────────────────


def test_pending_freezes_the_clock(assigned_ticket, nrb_electrician):
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="awaiting_materials",
    )
    assert assigned_ticket.paused_at is not None


def test_resuming_pushes_the_deadline_out_by_the_paused_time(
    assigned_ticket, nrb_electrician
):
    """A ticket parked for two days must not owe those two days back."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket,
        "pending",
        actor=nrb_electrician,
        pending_reason="awaiting_materials",
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


# ── Reopen restarts the lifecycle ─────────────────────────────────────────────


def test_reopen_clears_the_assignee(assigned_ticket, nrb_electrician):
    """`open` is the unassigned state — claim and assign both depend on it."""
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    transition_status(assigned_ticket, "open", actor=nrb_electrician)

    assert assigned_ticket.status == "open"
    assert assigned_ticket.assigned_to_id is None


def test_reopen_restarts_the_sla_and_drops_stale_timestamps(
    assigned_ticket, nrb_electrician
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


def test_reopen_is_logged_as_reopened_not_status_changed(
    assigned_ticket, nrb_electrician
):
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    transition_status(assigned_ticket, "open", actor=nrb_electrician)
    assert TicketLog.objects.filter(
        ticket=assigned_ticket, event_type="reopened"
    ).exists()


def test_reopening_a_closed_ticket_is_allowed(assigned_ticket, nrb_electrician):
    advance(assigned_ticket, "in_progress", "resolved", "closed", actor=nrb_electrician)
    transition_status(assigned_ticket, "open", actor=nrb_electrician)
    assert assigned_ticket.status == "open"


# ── Who may drive a transition ────────────────────────────────────────────────


def _post_status(api, ticket, status, **extra):
    return api.post(
        reverse("ticket-status", args=[ticket.pk]),
        {"status": status, **extra},
        format="json",
    )


def test_assigned_technician_may_progress_their_own_ticket(
    api, assigned_ticket, nrb_electrician
):
    api.force_authenticate(nrb_electrician)
    assert _post_status(api, assigned_ticket, "in_progress").status_code == 200


def test_technician_may_not_progress_someone_elses_ticket(
    api, assigned_ticket, nrb_section, electrical
):
    """Section scope grants sight of a ticket, not authority over it."""
    from tests import factories

    bystander = factories.make_technician("second_elec", nrb_section, [electrical])
    api.force_authenticate(bystander)
    assert _post_status(api, assigned_ticket, "in_progress").status_code == 403


def test_hos_may_progress_any_ticket_in_their_section(api, assigned_ticket, nrb_hos):
    api.force_authenticate(nrb_hos)
    assert _post_status(api, assigned_ticket, "in_progress").status_code == 200


def test_requester_may_close_their_own_resolved_ticket(
    api, assigned_ticket, nrb_electrician, requester
):
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    api.force_authenticate(requester)
    assert _post_status(api, assigned_ticket, "closed").status_code == 200


def test_requester_may_reopen_their_own_ticket(
    api, assigned_ticket, nrb_electrician, requester
):
    advance(assigned_ticket, "in_progress", "resolved", actor=nrb_electrician)
    api.force_authenticate(requester)
    assert _post_status(api, assigned_ticket, "open").status_code == 200


def test_requester_may_not_drive_the_work_itself(
    api, assigned_ticket, requester
):
    """Close and reopen only — a requester cannot mark their own job done."""
    api.force_authenticate(requester)
    assert _post_status(api, assigned_ticket, "in_progress").status_code == 403


# ── Comment gating ────────────────────────────────────────────────────────────


def _post_comment(api, ticket, body="hello"):
    return api.post(
        reverse("ticket-comments", args=[ticket.pk]), {"body": body}, format="json"
    )


def test_comments_are_closed_until_a_technician_is_assigned(
    api, nrb_electrical_ticket, nrb_hos
):
    api.force_authenticate(nrb_hos)
    response = _post_comment(api, nrb_electrical_ticket)
    assert response.status_code == 400


def test_comments_open_once_assigned(api, assigned_ticket, nrb_electrician):
    api.force_authenticate(nrb_electrician)
    assert _post_comment(api, assigned_ticket).status_code == 201


def test_comments_close_permanently_when_the_ticket_closes(
    api, assigned_ticket, nrb_electrician
):
    advance(assigned_ticket, "in_progress", "resolved", "closed", actor=nrb_electrician)
    api.force_authenticate(nrb_electrician)
    assert _post_comment(api, assigned_ticket).status_code == 400


def test_only_the_assignee_may_comment_among_technicians(
    api, assigned_ticket, nrb_section, electrical
):
    from tests import factories

    bystander = factories.make_technician("third_elec", nrb_section, [electrical])
    api.force_authenticate(bystander)
    assert _post_comment(api, assigned_ticket).status_code == 403


def test_requester_sees_only_public_comments(
    api, assigned_ticket, nrb_electrician, requester
):
    """Internal notes between staff must not surface on the requester's view."""
    from apps.tickets.models import TicketComment

    TicketComment.objects.create(
        ticket=assigned_ticket, author=nrb_electrician,
        body="internal note", visibility="internal",
    )
    TicketComment.objects.create(
        ticket=assigned_ticket, author=nrb_electrician,
        body="on my way", visibility="public",
    )

    api.force_authenticate(requester)
    response = api.get(reverse("ticket-comments", args=[assigned_ticket.pk]))
    assert response.status_code == 200
    bodies = {row["body"] for row in response.json()["results"]}
    assert bodies == {"on my way"}


# ── Waiting on the requester ──────────────────────────────────────────────────
#
# A resolved ticket nobody rates leaves the satisfaction figure built from
# whoever happened to reopen the ticket. `has_feedback` is what lets the
# requester's own dashboard say "these are still waiting for you".


def test_a_resolved_ticket_starts_unrated(api, requester, nrb_electrical_ticket):
    nrb_electrical_ticket.status = "resolved"
    nrb_electrical_ticket.save(update_fields=["status"])

    api.force_authenticate(requester)
    rows = api.get(reverse("ticket-list"), {"mine": 1}).json()["results"]
    assert [row["has_feedback"] for row in rows] == [False]


def test_rating_a_ticket_flips_the_flag(api, requester, nrb_electrical_ticket):
    from apps.tickets.models import TicketFeedback

    nrb_electrical_ticket.status = "resolved"
    nrb_electrical_ticket.save(update_fields=["status"])
    TicketFeedback.objects.create(ticket=nrb_electrical_ticket, rating=4)

    api.force_authenticate(requester)
    rows = api.get(reverse("ticket-list"), {"mine": 1}).json()["results"]
    assert [row["has_feedback"] for row in rows] == [True]


def test_the_flag_says_nothing_about_the_rating_itself(
    api, requester, nrb_electrical_ticket
):
    """A list of everyone's scores is a different thing from a nudge to rate.
    The list carries the flag; the rating stays on the detail view."""
    from apps.tickets.models import TicketFeedback

    TicketFeedback.objects.create(ticket=nrb_electrical_ticket, rating=1, comment="bad")

    api.force_authenticate(requester)
    row = api.get(reverse("ticket-list"), {"mine": 1}).json()["results"][0]
    assert row["has_feedback"] is True
    assert "feedback" not in row


def test_the_flag_costs_no_query_per_row(
    api, requester, nrb_section, electrical, priorities, django_assert_num_queries
):
    """Exists() as an annotation, not a per-row lookup.

    Asserted as "the same number of queries for one ticket as for six" rather
    than a fixed count, so the test survives unrelated changes to pagination
    but still fails the moment the flag starts costing a query per row.
    """
    from django.db import connection, reset_queries
    from django.test.utils import CaptureQueriesContext
    from tests import factories

    api.force_authenticate(requester)

    factories.make_ticket(requester, nrb_section, electrical)
    with CaptureQueriesContext(connection) as first:
        assert api.get(reverse("ticket-list"), {"mine": 1}).status_code == 200

    for _ in range(5):
        factories.make_ticket(requester, nrb_section, electrical)
    reset_queries()
    with CaptureQueriesContext(connection) as second:
        response = api.get(reverse("ticket-list"), {"mine": 1})

    assert len(response.json()["results"]) == 6
    assert len(second) == len(first), (
        f"{len(first)} queries for 1 ticket, {len(second)} for 6 — the flag is "
        "being evaluated per row"
    )


# ── The HOS's handover note ───────────────────────────────────────────────────


def _assign(api, ticket, technician, **extra):
    from django.urls import reverse

    return api.post(
        reverse("ticket-assign", args=[ticket.pk]),
        {"assigned_to": technician.pk, **extra},
        format="json",
    )


def test_the_assignment_note_reaches_the_technician(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket
):
    """The note the HOS types when handing the job over must survive the round
    trip. The modal collected it and `assignTicket` never sent it, so the one
    instruction attached to a job — which cupboard, which key, third failure
    this month — was discarded between the two people who needed it.

    It lands on the `assigned` log row rather than on the Ticket: it describes
    the handover, not the ticket's own state (invariant 2).
    """
    api.force_authenticate(nrb_hos)
    note = "Stopcock is behind the cupboard in 204 — carry the long key."
    assert _assign(api, nrb_electrical_ticket, nrb_electrician, note=note).status_code == 200

    log = TicketLog.objects.get(ticket=nrb_electrical_ticket, event_type="assigned")
    assert log.reason == note


def test_assignment_without_a_note_records_nothing(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket
):
    """The note is optional and blank must leave no trace — an empty string in
    the audit log renders as an empty quote block under the event."""
    api.force_authenticate(nrb_hos)
    assert _assign(api, nrb_electrical_ticket, nrb_electrician).status_code == 200
    assert (
        TicketLog.objects.get(
            ticket=nrb_electrical_ticket, event_type="assigned"
        ).reason
        == ""
    )


def test_reassignment_keeps_the_earlier_note(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, nrb_section, electrical
):
    """Each handover carries its own note. Storing it on the Ticket would let
    the second assignment overwrite what the first one told the first person,
    erasing the record of why they were sent."""
    from tests import factories

    second = factories.make_technician("second_elec", nrb_section, [electrical])
    api.force_authenticate(nrb_hos)
    _assign(api, nrb_electrical_ticket, nrb_electrician, note="first note")
    _assign(api, nrb_electrical_ticket, second, note="second note")

    assert (
        TicketLog.objects.get(
            ticket=nrb_electrical_ticket, event_type="assigned"
        ).reason
        == "first note"
    )
    assert (
        TicketLog.objects.get(
            ticket=nrb_electrical_ticket, event_type="reassigned"
        ).reason
        == "second note"
    )


# ── Rating a finished job ─────────────────────────────────────────────────────


def _rate(api, ticket, **payload):
    return api.post(
        reverse("ticket-feedback", args=[ticket.pk]), payload, format="json"
    )


def test_the_requester_rates_their_resolved_ticket(
    api, requester, nrb_electrician, nrb_electrical_ticket
):
    """The happy path had no test — only the outsider 403s and the list
    endpoint did — which left the view's own fetch unexercised while it was
    the one action view still using a bare get_object_or_404."""
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
    # Second attempt is refused: a rating is the requester's one verdict.
    assert _rate(api, t, rating=1).status_code == 409


def test_an_unresolved_ticket_cannot_be_rated(api, requester, nrb_electrical_ticket):
    """Rating open work would measure an outcome that has not happened."""
    api.force_authenticate(requester)
    assert _rate(api, nrb_electrical_ticket, rating=5).status_code == 400


# ── The Overdue pill ──────────────────────────────────────────────────────────


def _overdue_ids(api):
    response = api.get(reverse("ticket-list"), {"overdue": "1"})
    assert response.status_code == 200
    return {row["ticket_no"] for row in response.json()["results"]}


def test_overdue_returns_only_live_work_past_its_target(
    api, nrb_hos, nrb_electrician, requester, nrb_section, electrical, plumbing,
    priorities,
):
    """The pill used to be dead state: it lit up, set status to `all`, and was
    never read, so "Overdue" listed every ticket in scope — resolved ones
    included. Same predicate as analytics' `breached`, so the pill and the KPI
    cannot mean different things.
    """
    past = timezone.now() - timedelta(hours=2)
    future = timezone.now() + timedelta(hours=2)

    late = factories.make_ticket(
        requester, nrb_section, electrical, resolution_due_at=past
    )
    on_time = factories.make_ticket(
        requester, nrb_section, electrical, resolution_due_at=future
    )

    # Settled, and its deadline is long past: judged against resolved_at, not
    # the clock. This is the row the broken filter used to show.
    settled = factories.make_ticket(
        requester, nrb_section, plumbing, resolution_due_at=past
    )
    settled.assigned_to = nrb_electrician
    settled.save(update_fields=["assigned_to"])
    transition_status(settled, "assigned", nrb_hos)
    transition_status(settled, "in_progress", nrb_electrician)
    transition_status(settled, "resolved", nrb_electrician)

    api.force_authenticate(nrb_hos)
    ids = _overdue_ids(api)

    assert late.ticket_no in ids
    assert on_time.ticket_no not in ids
    assert settled.ticket_no not in ids


def test_a_paused_ticket_is_never_overdue(
    api, nrb_hos, nrb_electrician, requester, nrb_section, electrical, priorities
):
    """A ticket held for parts nobody can supply is not late (R9). Its stored
    deadline drifts into the past while it waits, which is exactly why this
    filter reads RUNNING_STATUSES and not ACTIVE_STATUSES."""
    t = factories.make_ticket(
        requester, nrb_section, electrical,
        resolution_due_at=timezone.now() - timedelta(hours=2),
    )
    t.assigned_to = nrb_electrician
    t.save(update_fields=["assigned_to"])
    transition_status(t, "assigned", nrb_hos)
    transition_status(t, "in_progress", nrb_electrician)
    transition_status(t, "pending", nrb_electrician, pending_reason="awaiting_materials")

    api.force_authenticate(nrb_hos)
    assert t.ticket_no not in _overdue_ids(api)
