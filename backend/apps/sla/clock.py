"""The SLA clock: when a ticket is due, and whether it made its target.

Every "is this late?" predicate in the codebase comes from here. A second
module writing one by hand is how a ticket's own badge starts contradicting
the dashboard it appears on.

Used by:
    tickets.serializers      is_overdue, compute_due_dates
    tickets.lifecycle        compute_due_dates (create and reopen)
    tickets.views            q_overdue (the ?overdue=1 filter)
    analytics.services       q_overdue, q_at_risk, q_met, q_settled_with_due
    analytics.insights       q_overdue
    sla.check_sla            q_overdue
    common.seed              compute_due_dates
"""

from datetime import timedelta

from django.db.models import F, Q
from django.utils import timezone

from apps.tickets.constants import RUNNING_STATUSES, TERMINAL_STATUSES

# How close to the deadline counts as "about to go".
AT_RISK_WINDOW = timedelta(hours=4)


def compute_due_dates(priority, start):
    """Return (response_due_at, resolution_due_at) for a priority from `start`.

    Called at ticket creation and again on reopen, which restarts the clock
    from the reopen time.
    """
    return (
        start + timedelta(minutes=priority.response_minutes),
        start + timedelta(minutes=priority.resolution_minutes),
    )


def _now(now=None):
    return now if now is not None else timezone.now()


# ── Live work ─────────────────────────────────────────────────────────────────
# Both gate on RUNNING_STATUSES, not ACTIVE_STATUSES: `pending` freezes the
# timer, so a ticket waiting on parts must not turn red for a delay the section
# was told to take.


def q_overdue(now=None):
    """Running, has a target, and past it."""
    return Q(
        status__in=RUNNING_STATUSES,
        resolution_due_at__isnull=False,
        resolution_due_at__lt=_now(now),
    )


def q_at_risk(now=None, window=AT_RISK_WINDOW):
    """Running, has a target, not yet past it, and inside `window` of it."""
    moment = _now(now)
    return Q(
        status__in=RUNNING_STATUSES,
        resolution_due_at__isnull=False,
        resolution_due_at__gt=moment,
        resolution_due_at__lte=moment + window,
    )


def is_overdue(ticket, now=None):
    """`q_overdue` for a single in-memory ticket, for the serializer's flag.

    Kept beside the Q it mirrors so a reviewer changing one sees the other.
    """
    if ticket.status not in RUNNING_STATUSES:
        return False
    if ticket.resolution_due_at is None:
        return False
    return _now(now) > ticket.resolution_due_at


# ── Settled work ──────────────────────────────────────────────────────────────
# A finished ticket is judged against `resolved_at`, never against the clock:
# comparing a closed ticket's due date to "now" marks every ticket ever closed
# as late once that date passes.


def q_settled_with_due():
    """Finished, and there was a target to judge it against.

    The denominator of every SLA-attainment percentage. A ticket with no
    resolution target is not a miss, it is unmeasurable.
    """
    return Q(status__in=TERMINAL_STATUSES, resolution_due_at__isnull=False)


def q_met():
    """Finished on or before target."""
    return q_settled_with_due() & Q(
        resolved_at__isnull=False, resolved_at__lte=F("resolution_due_at")
    )
