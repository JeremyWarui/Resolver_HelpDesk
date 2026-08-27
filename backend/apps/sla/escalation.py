"""Moving a ticket up a level when it has been open too long.

Escalation is structural — technician to HOS to HOD — so the thresholds are
two columns on the ticket's Priority, not a rule table. A vacant post is
skipped and the ticket carries on upward.
"""

from datetime import timedelta

from django.utils import timezone

from apps.accounts.scope import post_holder
from apps.notifications.notify import emit_ticket_escalated
from apps.tickets.constants import ACTIVE_STATUSES, TERMINAL_STATUSES
from apps.tickets.models import Ticket, TicketLog

LEVEL_ORDER = {"technician": 0, "hos": 1, "hod": 2}


def resolve_active_holder(campus, level):
    """The user a ticket escalates to at `level`, or None if the post is vacant.

    Reads `RoleAssignment`, the only record of who holds a post. A vacant post
    means the escalation falls through to the next level up. Both posts are
    campus-scoped: an HOS and an HOD differ in rank, not in reach.
    """
    if level in ("hos", "hod"):
        return post_holder(level, campus=campus)
    return None


def thresholds(priority):
    """The two structural steps for a priority, in order, as (level, minutes)."""
    return (
        ("hos", priority.escalate_to_hos_minutes),
        ("hod", priority.escalate_to_hod_minutes),
    )


def active_elapsed(ticket, now):
    """How long the clock has actually run — time spent on hold does not count."""
    end = ticket.paused_at if ticket.paused_at is not None else now
    return (end - ticket.created_at) - ticket.accumulated_pause


def run_escalation_for_ticket(ticket, now):
    """Escalate one ticket if it is past its next threshold. Returns whether it moved."""
    if ticket.status in TERMINAL_STATUSES:
        return False

    current_order = LEVEL_ORDER[ticket.current_level]
    remaining = [
        (level, minutes)
        for level, minutes in thresholds(ticket.priority)
        if LEVEL_ORDER[level] > current_order
    ]
    if not remaining:
        return False
    if active_elapsed(ticket, now) < timedelta(minutes=remaining[0][1]):
        return False

    # A vacant post is skipped rather than escalated to, so the ticket keeps
    # climbing until it reaches someone who can act on it.
    for level, _ in remaining:
        holder = resolve_active_holder(ticket.requester_campus, level)
        if holder is None:
            continue
        old_level = ticket.current_level
        ticket.current_level = level
        ticket.save(update_fields=["current_level", "updated_at"])
        TicketLog.objects.create(
            ticket=ticket,
            actor=None,
            event_type="escalated",
            from_value=old_level,
            to_value=level,
            level_user=holder,
        )
        emit_ticket_escalated(ticket, holder)
        return True

    return False


def run_escalations():
    """Escalate every eligible ticket. Returns how many moved."""
    now = timezone.now()
    tickets = (
        Ticket.objects.filter(status__in=ACTIVE_STATUSES)
        .exclude(current_level="hod")
        .select_related("priority", "requester_campus")
    )
    return sum(1 for ticket in tickets if run_escalation_for_ticket(ticket, now))
