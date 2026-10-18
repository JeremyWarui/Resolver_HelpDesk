"""Moving a ticket up a level when it has been open too long.

Escalation is structural — technician to HOS to HOD — so the thresholds are
two columns on the ticket's Priority. A vacant post is skipped and the ticket
carries on upward.

The check runs on a schedule (`process_auto_escalations`, every
`ESCALATION_INTERVAL_MINUTES`) and on the admin's word; each pass is an
`EscalationRun`, which is how the admin knows the schedule is alive.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.accounts.scope import post_holder
from apps.notifications.notify import emit_ticket_escalated
from apps.tickets.constants import ACTIVE_STATUSES, LEVEL_ORDER, TERMINAL_STATUSES
from apps.tickets.models import EscalationRun, Ticket, TicketLog

logger = logging.getLogger(__name__)

# A schedule that has missed this many of its runs has stopped, and a run that
# has gone this many intervals without finishing has died.
MISSED_RUNS_BEFORE_STALE = 4


def resolve_active_holder(campus, level):
    """The user a ticket escalates to at `level`, or None if the post is vacant.

    Reads `RoleAssignment`, the only record of who holds a post. Both posts are
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
    return (end - ticket.clock_started_at) - ticket.accumulated_pause


def next_step(ticket, now):
    """Where the ticket climbs to now, as (level, holder), or None. Reads, never writes.

    A vacant post is skipped, so the ticket keeps climbing until it reaches
    someone who can act on it.
    """
    if ticket.status in TERMINAL_STATUSES:
        return None

    current_order = LEVEL_ORDER[ticket.current_level]
    remaining = [
        (level, minutes)
        for level, minutes in thresholds(ticket.priority)
        if LEVEL_ORDER[level] > current_order
    ]
    if not remaining:
        return None
    if active_elapsed(ticket, now) < timedelta(minutes=remaining[0][1]):
        return None

    for level, _ in remaining:
        holder = resolve_active_holder(ticket.requester_campus, level)
        if holder is not None:
            return level, holder
    return None


def _escalate(ticket, now):
    """Escalate one ticket if it is past its next threshold; the level it reached, or None."""
    step = next_step(ticket, now)
    if step is None:
        return None
    level, holder = step
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
    return level


def _candidates():
    """Every ticket that might climb, as (pk, current_level) read now."""
    return list(
        Ticket.objects.filter(status__in=ACTIVE_STATUSES)
        .exclude(current_level="hod")
        .order_by("pk")
        .values_list("pk", "current_level")
    )


def _escalate_candidates(candidates, now, on_move=None, on_error=None):
    """Escalate each candidate still at the level it was read at; yield (ticket, from, to).

    Each ticket is locked in its own transaction. A run that overlaps another
    waits on the lock, finds the level has changed since it read the
    candidates, and leaves the ticket to the next run: one level per run.
    `on_move` is called inside that transaction, so a tally commits with the
    move it counts. With `on_error`, a ticket that raises is rolled back, its
    error passed on, and the run goes on to the next.
    """
    for pk, level in candidates:
        try:
            with transaction.atomic():
                ticket = (
                    Ticket.objects.select_related("priority", "requester_campus")
                    .select_for_update(of=("self",))
                    .filter(pk=pk, current_level=level, status__in=ACTIVE_STATUSES)
                    .first()
                )
                if ticket is None:
                    continue
                reached = _escalate(ticket, now)
                if reached and on_move:
                    on_move(reached)
        except Exception as exc:
            if on_error is None:
                raise
            logger.exception("Escalating ticket %s failed", pk)
            on_error(f"ticket {pk}: {type(exc).__name__}: {exc}")
            continue
        if reached:
            yield ticket, level, reached


def run_escalations():
    """Escalate every eligible ticket. Returns how many moved."""
    return sum(1 for _ in _escalate_candidates(_candidates(), timezone.now()))


def record_run(started_by=None, scheduled=False):
    """Run the check and keep a record of it, counting each move as it lands.

    Each count and each skipped ticket's name is saved as it happens, so a
    task killed part-way still says what it moved and what it skipped. A ticket
    that raises is skipped; the rest still climb. A run that cannot start keeps
    its error and is re-raised.
    """
    run = EscalationRun.objects.create(started_by=started_by, scheduled=scheduled)
    errors = []

    def note(message):
        errors.append(message)
        run.error = "; ".join(errors)[:2000]
        run.save(update_fields=["error"])

    try:
        for _ in _escalate_candidates(
            _candidates(), timezone.now(), on_move=lambda level: _tally(run.pk, level), on_error=note
        ):
            pass
    except Exception as exc:
        note(f"{type(exc).__name__}: {exc}")
        raise
    run.finished_at = timezone.now()
    run.save(update_fields=["finished_at"])
    run.refresh_from_db(fields=["to_hos", "to_hod"])
    return run


def _tally(run_pk, level):
    """Count one move on its run, in the database, so a rolled-back tally leaves no trace."""
    field = "to_hos" if level == "hos" else "to_hod"
    EscalationRun.objects.filter(pk=run_pk).update(**{field: F(field) + 1})


def preview():
    """What a run would move now: (ticket, from_level, to_level) for each.

    It asks `next_step`, the question a run asks before it writes, and writes
    and locks nothing.
    """
    now = timezone.now()
    tickets = (
        Ticket.objects.filter(status__in=ACTIVE_STATUSES)
        .exclude(current_level="hod")
        .select_related("priority", "requester_campus")
        .order_by("pk")
    )
    moves = []
    for ticket in tickets:
        step = next_step(ticket, now)
        if step:
            moves.append((ticket, ticket.current_level, step[0]))
    return moves


def overdue_after():
    """How long a run may go without finishing before it is taken to have stopped."""
    return timedelta(minutes=settings.ESCALATION_INTERVAL_MINUTES * MISSED_RUNS_BEFORE_STALE)


def schedule_state(now=None):
    """The schedule's state, with its last finished run. Only scheduled runs count.

    "never": none has ever started. "stale": none has started within
    `overdue_after`, so the task has stopped. "failing": the latest run that is
    no longer in progress failed, or never finished, as one killed at its time
    limit does. "running" otherwise, a run still in progress included.
    """
    now = now or timezone.now()
    scheduled = EscalationRun.objects.filter(scheduled=True)
    latest = scheduled.first()
    last = scheduled.filter(finished_at__isnull=False).first()
    if latest is None:
        return "never", None
    if now - latest.started_at > overdue_after():
        return "stale", last
    settled = next((run for run in scheduled[:2] if not in_progress(run, now)), None)
    if settled is not None and (settled.error or settled.finished_at is None):
        return "failing", last
    return "running", last


def in_progress(run, now):
    """Still going: neither finished nor failed, and younger than a run is allowed to be."""
    return run.finished_at is None and not run.error and now - run.started_at <= overdue_after()
