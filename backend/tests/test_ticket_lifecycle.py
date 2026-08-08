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


def test_every_status_has_an_entry_in_the_map(assigned_ticket):
    """A status missing from ALLOWED is a dead end nothing can leave."""
    statuses = {value for value, _ in type(assigned_ticket).STATUS}
    assert statuses == set(ALLOWED)


# ── The SLA clock ─────────────────────────────────────────────────────────────


def test_pending_freezes_the_clock(assigned_ticket, nrb_electrician):
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket, "pending", actor=nrb_electrician, reason="awaiting parts"
    )
    assert assigned_ticket.paused_at is not None


def test_resuming_pushes_the_deadline_out_by_the_paused_time(
    assigned_ticket, nrb_electrician
):
    """A ticket parked for two days must not owe those two days back."""
    advance(assigned_ticket, "in_progress", actor=nrb_electrician)
    transition_status(
        assigned_ticket, "pending", actor=nrb_electrician, reason="awaiting parts"
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
