"""Whether a ticket is late, as a Q and as a check on one row.

Every "is this late?" predicate comes from here, so a ticket's own badge cannot
contradict the dashboard it appears on. It lives beside the Ticket rather than
in `apps.sla` because every one of these filters a Ticket queryset; `apps.sla`
holds the policy, which knows nothing about tickets.
"""

from django.db.models import F, Q
from django.utils import timezone

from apps.tickets.constants import RUNNING_STATUSES, TERMINAL_STATUSES


def _now(now=None):
    return now if now is not None else timezone.now()


# RUNNING_STATUSES, not ACTIVE_STATUSES: `pending` freezes the timer, so a
# ticket waiting on parts must not turn red.


def q_overdue(now=None):
    """Running, has a target, and past it."""
    return Q(
        status__in=RUNNING_STATUSES,
        resolution_due_at__isnull=False,
        resolution_due_at__lt=_now(now),
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


# Judged against `resolved_at`, never the clock: comparing a closed ticket's
# due date to "now" marks every ticket ever closed as late.


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


def sla_outcome(ticket, now=None):
    """One ticket's standing: "met", "missed", "overdue", or None.

    The single-row form of `q_met`, `q_settled_with_due` and `is_overdue`, for
    a report that lists tickets. A settled ticket with no target is None, as
    it is left out of every percentage.
    """
    if ticket.status in TERMINAL_STATUSES:
        if ticket.resolution_due_at is None:
            return None
        met = ticket.resolved_at is not None and ticket.resolved_at <= ticket.resolution_due_at
        return "met" if met else "missed"
    return "overdue" if is_overdue(ticket, now) else None
