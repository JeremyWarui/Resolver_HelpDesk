"""
Where a ticket goes, and how it is allowed to move once it is there.

A view never writes `ticket.status`; it calls a function here, which carries
what must move with a status: the SLA clock, the hold reason, the audit row,
the notification.
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.accounts.identity import display_name
from apps.notifications.notify import (
    emit_ticket_assigned,
    emit_ticket_resolved,
    emit_ticket_status_changed,
)
from apps.tickets.constants import (
    PENDING_REASON_CODES,
    PENDING_REASON_LABELS,
    TERMINAL_STATUSES,
)
from apps.tickets.models import TicketLog

# `open` is by definition unassigned and claim relies on that, so reopen clears
# the assignee and restarts the clock. Mirrored by VALID_NEXT_STATUS in
# frontend/src/constants/tickets.ts; change both copies together.
ALLOWED = {
    "open": {"assigned"},
    "assigned": {"in_progress"},
    "in_progress": {"pending", "resolved"},
    "pending": {"in_progress", "resolved"},
    "resolved": {"closed", "open"},
    "closed": {"open"},
}


class TransitionError(Exception):
    """A status change that is not allowed from where the ticket is now."""


class AlreadyRated(TransitionError):
    """The ticket carries a rating for its current resolution."""


def transition_status(
    ticket,
    new_status,
    actor,
    reason="",
    pending_reason="",
    pending_reason_note="",
    notify=True,
):
    """Validate and apply a status transition, handling SLA pause/resume and logging.

    `reason` is the free-text audit note kept for every transition, and goes to
    the people told of the move. `pending_reason` is one of the six codes,
    required on the way into `pending` and cleared on the way out. `notify`
    is off when the caller sends one message for several moves.
    """

    if ticket.status == "pending" and new_status == "pending":
        return _change_hold_reason(ticket, actor, reason, pending_reason, pending_reason_note)

    if new_status not in ALLOWED.get(ticket.status, set()):
        raise TransitionError(
            f"Cannot transition from '{ticket.status}' to '{new_status}'."
        )

    pending_reason = (pending_reason or "").strip()
    pending_reason_note = (pending_reason_note or "").strip()

    if new_status == "pending":
        if not pending_reason:
            raise TransitionError("A reason is required when moving to pending.")
        if pending_reason not in PENDING_REASON_CODES:
            raise TransitionError(f"Unknown pending reason: '{pending_reason}'.")

    old_status = ticket.status
    previous_assignee_id = ticket.assigned_to_id
    now = timezone.now()
    is_reopen = old_status in TERMINAL_STATUSES and new_status == "open"

    # The hold reason moves with the pause, so `status` and `pending_reason` can
    # never disagree.
    if new_status == "pending":
        ticket.paused_at = now
        ticket.pending_reason = pending_reason
        ticket.pending_reason_note = pending_reason_note
    elif old_status == "pending" and new_status != "pending":
        ticket.pending_reason = ""
        ticket.pending_reason_note = ""
        if ticket.paused_at:
            pause = now - ticket.paused_at
            ticket.accumulated_pause += pause
            if ticket.response_due_at:
                ticket.response_due_at += pause
            if ticket.resolution_due_at:
                ticket.resolution_due_at += pause
            ticket.paused_at = None

    # `resolved_at` is what SLA outcome is judged against, so a settled ticket
    # keeps its verdict instead of being re-measured against a moved clock.
    if new_status == "resolved":
        ticket.resolved_at = now
    elif new_status == "closed":
        ticket.closed_at = now

    if is_reopen:
        # A reopened ticket starts over: unassigned, at the technician level, on
        # a fresh clock. Its earlier history stays in TicketLog.
        ticket.assigned_to = None
        ticket.current_level = "technician"
        ticket.clock_started_at = now
        ticket.response_due_at, ticket.resolution_due_at = ticket.priority.due_dates(
            now
        )
        ticket.paused_at = None
        ticket.accumulated_pause = timedelta(0)
        ticket.resolved_at = None
        ticket.closed_at = None
        ticket.pending_reason = ""
        ticket.pending_reason_note = ""
        # The rating judged the work that failed; the next resolution gets its
        # own. The old one stays on the trail as its `rated` row.
        ticket.rating = None
        ticket.rating_comment = ""
        ticket.rated_at = None

    ticket.status = new_status
    ticket.save(
        update_fields=[
            "status",
            "assigned_to",
            "current_level",
            "clock_started_at",
            "paused_at",
            "accumulated_pause",
            "pending_reason",
            "pending_reason_note",
            "response_due_at",
            "resolution_due_at",
            "resolved_at",
            "closed_at",
            "rating",
            "rating_comment",
            "rated_at",
            "updated_at",
        ]
    )

    if new_status == "resolved":
        event_type = "resolved"
    elif new_status == "closed":
        event_type = "closed"
    elif is_reopen:
        event_type = "reopened"
    else:
        event_type = "status_changed"

    # The timeline is read by people, so the label is composed into the prose here;
    # analytics reads the code off the ticket.
    log_reason = reason
    if new_status == "pending":
        log_reason = " — ".join(
            p for p in (PENDING_REASON_LABELS[pending_reason], pending_reason_note) if p
        )

    TicketLog.objects.create(
        ticket=ticket,
        actor=actor,
        event_type=event_type,
        from_value=old_status,
        to_value=new_status,
        reason=log_reason,
    )

    if notify:
        if new_status == "resolved":
            emit_ticket_resolved(ticket, actor, note=reason)
        else:
            emit_ticket_status_changed(
                ticket,
                actor,
                old_status,
                # A hold carries the dialog's note and the hold's own note; both are sent.
                note=(
                    "\n".join(dict.fromkeys(p for p in (reason, pending_reason_note) if p))
                    if new_status == "pending"
                    else reason
                ),
                hold_reason=PENDING_REASON_LABELS.get(pending_reason, ""),
                previous_assignee_id=previous_assignee_id,
            )

    return ticket


@transaction.atomic
def _change_hold_reason(ticket, actor, reason, pending_reason, pending_reason_note):
    """Keep a held ticket held, for a new cause: one hold ends, another begins.

    Logged as the two moves it is, and sent as one message, so nobody is told
    work resumed when it did not.
    """
    if (pending_reason or "").strip() == ticket.pending_reason:
        raise TransitionError("The ticket is already held for that reason.")
    transition_status(ticket, "in_progress", actor, reason="Hold reason updated", notify=False)
    transition_status(
        ticket, "pending", actor,
        reason=reason, pending_reason=pending_reason,
        pending_reason_note=pending_reason_note, notify=False,
    )
    emit_ticket_status_changed(
        ticket, actor, "pending", new_status="pending",
        note="\n".join(dict.fromkeys(p for p in (reason, pending_reason_note) if p)),
        hold_reason=PENDING_REASON_LABELS.get(ticket.pending_reason, ""),
    )
    return ticket


def claim_ticket(ticket, technician):
    """Self-assign an unassigned open ticket to `technician`.

    The caller must already hold the row lock (`select_for_update`, inside an
    atomic block); the check here is the post-lock re-read that makes the second
    of two simultaneous claims lose.

    Drives open → assigned → in_progress through `transition_status`, so a claim
    leaves the same log rows as the two moves made by hand, and sends one
    message for the whole of it.
    """
    if ticket.status != "open" or ticket.assigned_to_id is not None:
        raise TransitionError("Ticket has already been claimed or assigned.")

    ticket.assigned_to = technician
    ticket.save(update_fields=["assigned_to", "updated_at"])

    TicketLog.objects.create(
        ticket=ticket,
        actor=technician,
        event_type="assigned",
        from_value="",
        to_value=display_name(technician),
    )
    transition_status(ticket, "assigned", technician, notify=False)
    transition_status(ticket, "in_progress", technician, notify=False)
    emit_ticket_assigned(ticket, technician, claimed=True)
    return ticket


@transaction.atomic
def rate_ticket(ticket, actor, rating, comment=""):
    """Record the requester's rating, and close the ticket if it is resolved.

    Rating is the requester's sign-off, so a rated ticket is a closed one; the
    two writes share a transaction and cannot be left half done. A ticket
    closed without a rating may still be rated.
    """
    if ticket.status not in TERMINAL_STATUSES:
        raise TransitionError("Feedback can only be submitted once the ticket is resolved.")
    # `rated_at`, not `rating`: a one-star rating is still a rating.
    if ticket.rated_at is not None:
        raise AlreadyRated("Feedback has already been submitted.")

    ticket.rating = rating
    ticket.rating_comment = comment
    ticket.rated_at = timezone.now()
    ticket.save(update_fields=["rating", "rating_comment", "rated_at", "updated_at"])
    TicketLog.objects.create(
        ticket=ticket, actor=actor, event_type="rated", to_value=str(rating)
    )

    if ticket.status == "resolved":
        transition_status(ticket, "closed", actor)
    return ticket


def assign_ticket(ticket, assignee, actor, priority=None, note=""):
    """Hand a ticket to `technician`, optionally setting its real priority.

    Reassignment is the same call, so the caller must pass a ticket whose
    `assigned_to` is still the old one. Live work only — reopen a settled
    ticket first, which is what restarts the clock.
    """
    if ticket.status in TERMINAL_STATUSES:
        raise TransitionError(
            f"Cannot assign a ticket that is '{ticket.status}'. Reopen it first."
        )

    previous_assignee = ticket.assigned_to
    old_status = ticket.status
    old_priority = ticket.priority

    ticket.assigned_to = assignee
    if old_status == "open":
        ticket.status = "assigned"

    updated_fields = ["assigned_to", "status", "updated_at"]
    priority_changed = priority is not None and priority.pk != old_priority.pk
    if priority_changed:
        ticket.priority = priority
        # From the clock's start, not now: re-basing would hand back time the
        # ticket has already spent waiting.
        ticket.response_due_at, ticket.resolution_due_at = priority.due_dates(
            ticket.clock_started_at
        )
        updated_fields += ["priority", "response_due_at", "resolution_due_at"]

    ticket.save(update_fields=updated_fields)

    if priority_changed:
        TicketLog.objects.create(
            ticket=ticket,
            actor=actor,
            event_type="priority_changed",
            from_value=old_priority.name,
            to_value=priority.name,
        )

    TicketLog.objects.create(
        ticket=ticket,
        actor=actor,
        event_type="reassigned" if previous_assignee is not None else "assigned",
        from_value=display_name(previous_assignee),
        to_value=display_name(assignee),
        reason=note,
    )
    emit_ticket_assigned(ticket, actor, previous_assignee=previous_assignee, note=note)
    return ticket
