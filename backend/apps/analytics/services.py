"""
Every number this system reports, computed once.

One entry point, `aggregate()`. Scope arrives already applied. Counts are
conditional aggregates over direct Ticket columns, never a join, because a
join fans the rows out.
"""

from datetime import datetime, timedelta
from typing import Optional

from django.db.models import Avg, Count, F, OuterRef, Q, Subquery
from django.utils import timezone

from apps.sla.clock import q_met, q_overdue, q_settled_with_due
from apps.tickets.constants import (
    ACTIVE_STATUSES,
    ESCALATED_LEVELS,
    TERMINAL_STATUSES,
)
from apps.tickets.models import TicketFeedback, TicketLog


def resolve_date_range(params: dict) -> dict:
    """Turn the request's date params into the window being reported on."""
    now = timezone.now()
    date_from_param = params.get("date_from")
    date_to_param = params.get("date_to")
    days_param = params.get("days")

    if date_from_param and date_to_param:
        date_from = datetime.fromisoformat(str(date_from_param))
        date_to = datetime.fromisoformat(str(date_to_param))
        if not timezone.is_aware(date_from):
            date_from = timezone.make_aware(date_from)
        if not timezone.is_aware(date_to):
            date_to = timezone.make_aware(date_to)
    else:
        days = int(days_param) if days_param else 30
        date_to = now
        date_from = now - timedelta(days=days)

    return {"date_from": date_from, "date_to": date_to}


def created_window(qs, date_range):
    """Narrow to tickets *created* inside the window — the default lens.

    Every headline number and every breakdown counts by creation date, so this
    is the one expression they share: an endpoint that spells the window out
    again is how two figures on the same page start disagreeing.
    """
    return qs.filter(
        created_at__gte=date_range["date_from"],
        created_at__lte=date_range["date_to"],
    )


def resolved_window(qs, date_range):
    """Narrow to tickets settled inside the window.

    "Raised this month" and "finished this month" are different sets. The
    status check is what keeps a live ticket out of a resolved-in-window count,
    since `resolved_at` is cleared by a reopen.
    """
    return qs.filter(
        resolved_at__gte=date_range["date_from"],
        resolved_at__lte=date_range["date_to"],
        status__in=TERMINAL_STATUSES,
    )


def resolution_seconds(resolved_at, created_at, accumulated_pause):
    """Working seconds between raising a ticket and resolving it.

    Holds come out: a ticket waiting three days on a part nobody could supply
    did not take three days of anybody's work. Returns None when either
    timestamp is missing, and never a negative.
    """
    if not (resolved_at and created_at):
        return None
    elapsed = (resolved_at - created_at) - (accumulated_pause or timedelta())
    return max(elapsed.total_seconds(), 0.0)


# Each dimension is a key expression, a label expression, and the relation a
# row must have to be counted at all.
_DIMENSIONS = {
    "sub_section": (F("sub_section__id"), F("sub_section__name"), None),
    "technician": (F("assigned_to__id"), F("assigned_to__username"), "assigned_to"),
    "status": (F("status"), F("status"), None),
    "campus": (
        F("requester_campus__id"),
        F("requester_campus__name"),
        None,
    ),
    "facility": (
        F("location__facility__id"),
        F("location__facility__name"),
        "location__facility",
    ),
}


def _breakdown_metrics():
    """The metric set every breakdown row carries."""
    return dict(
        total=Count("id"),
        open_count=Count("id", filter=Q(status__in=ACTIVE_STATUSES)),
        resolved_count=Count("id", filter=Q(status__in=TERMINAL_STATUSES)),
        escalated_count=Count("id", filter=Q(current_level__in=ESCALATED_LEVELS)),
        resolution_sla_met=Count("id", filter=q_met()),
        total_resolved_with_due=Count("id", filter=q_settled_with_due()),
    )


def breakdown(scoped_qs, date_range: dict, group_by: str) -> list:
    """Rows for one dimension over the caller's scope and window.

    Unrecognised dimensions come back empty rather than raising, so a stale
    client cannot 500 the page.
    """
    spec = _DIMENSIONS.get(group_by)
    if spec is None:
        return []
    key_expr, label_expr, required = spec

    qs = created_window(scoped_qs, date_range)
    if required:
        # A row missing the relation is a gap in the data, not a bucket named "None".
        qs = qs.filter(**{f"{required}__isnull": False})

    return list(
        qs.values(key=key_expr, label=label_expr).annotate(**_breakdown_metrics())
        # Clear the model's default ordering: an ordering field joins the GROUP BY
        # whether or not it is in values(), splitting every row into one per ticket.
        .order_by("-total")
    )


def technician_load(scoped_qs):
    """Live open-ticket load per technician, in one query. No date window."""
    return list(
        scoped_qs.filter(status__in=ACTIVE_STATUSES, assigned_to__isnull=False)
        .values(
            technician_id=F("assigned_to__id"),
            username=F("assigned_to__username"),
            first_name=F("assigned_to__first_name"),
            last_name=F("assigned_to__last_name"),
        )
        .annotate(open_count=Count("id"))
        .order_by("-open_count")
    )


# `comment_added` is absent: a ticket answered only with a comment reads as
# never responded to.
_RESPONSE_EVENTS = (
    "assigned",
    "status_changed",
    "resolved",
    "closed",
    "escalated",
    "priority_changed",
)


def _mean(values: list) -> Optional[float]:
    """The average, or None for an empty list."""
    return round(sum(values) / len(values), 1) if values else None


def aggregate(scoped_qs, date_range: dict, group_by: Optional[str] = None) -> dict:
    """Compute the reported figures over `scoped_qs` for `date_range`.

    Returns one flat dict. Nothing is filtered on the way out — a figure means
    the same thing to every role, and the engine has no business knowing which
    one asked.
    """
    date_from = date_range["date_from"]
    date_to = date_range["date_to"]
    now = timezone.now()

    window_qs = created_window(scoped_qs, date_range)
    resolved_qs = resolved_window(scoped_qs, date_range)

    q_window = Q(created_at__gte=date_from, created_at__lte=date_to)
    q_resolved = Q(
        resolved_at__gte=date_from,
        resolved_at__lte=date_to,
        status__in=TERMINAL_STATUSES,
    )
    counts = scoped_qs.aggregate(
        open_backlog=Count("id", filter=Q(status__in=ACTIVE_STATUSES)),
        created=Count("id", filter=q_window),
        resolved=Count("id", filter=q_resolved),
        resolution_sla_total=Count("id", filter=q_resolved & q_settled_with_due()),
        resolution_sla_met=Count("id", filter=q_resolved & q_met()),
        # Live, deliberately outside the window: "how many are late right now".
        breached=Count("id", filter=q_overdue(now)),
        escalated_count=Count("id", filter=Q(current_level__in=ESCALATED_LEVELS)),
    )

    # Current state of every scoped ticket, not just the window's.
    status_distribution = list(
        scoped_qs.values("status").annotate(count=Count("id")).order_by("-count")
    )

    # A subquery, not a join: a ticket with twelve log rows must still count once.
    first_response_sq = (
        TicketLog.objects.filter(ticket=OuterRef("pk"), event_type__in=_RESPONSE_EVENTS)
        .order_by("created_at")
        .values("created_at")[:1]
    )
    responded = window_qs.annotate(
        first_response_at=Subquery(first_response_sq)
    ).filter(first_response_at__isnull=False)

    response_pairs = list(
        responded.filter(response_due_at__isnull=False).values_list(
            "first_response_at", "response_due_at"
        )
    )
    response_sla_total = len(response_pairs)
    response_sla_met = sum(1 for got, due in response_pairs if got <= due)
    response_sla_pct = (
        round(response_sla_met / response_sla_total * 100, 1)
        if response_sla_total
        else None
    )
    response_time_avg_seconds = _mean(
        [
            (got - raised).total_seconds()
            for got, raised in responded.values_list("first_response_at", "created_at")
        ]
    )

    resolution_time_avg_seconds = _mean(
        [
            secs
            for secs in (
                resolution_seconds(resolved_at, created_at, pause)
                for resolved_at, created_at, pause in resolved_qs.values_list(
                    "resolved_at", "created_at", "accumulated_pause"
                )
            )
            if secs is not None
        ]
    )

    resolution_sla_pct = (
        round(counts["resolution_sla_met"] / counts["resolution_sla_total"] * 100, 1)
        if counts["resolution_sla_total"]
        else None
    )

    csat_agg = TicketFeedback.objects.filter(ticket__in=resolved_qs).aggregate(
        avg=Avg("rating"), count=Count("id")
    )

    result = {
        "open_backlog": counts["open_backlog"],
        "created": counts["created"],
        "resolved": counts["resolved"],
        "status_distribution": status_distribution,
        "response_sla_pct": response_sla_pct,
        "resolution_sla_pct": resolution_sla_pct,
        "response_time_avg_seconds": response_time_avg_seconds,
        "resolution_time_avg_seconds": resolution_time_avg_seconds,
        "breached": counts["breached"],
        "escalated_count": counts["escalated_count"],
        "csat": round(float(csat_agg["avg"]), 2) if csat_agg["avg"] else None,
        "feedback_count": csat_agg["count"] or 0,
        "demand": {
            "by_sub_section": breakdown(scoped_qs, date_range, "sub_section"),
            "by_facility": breakdown(scoped_qs, date_range, "facility"),
        },
    }

    if group_by is not None:
        result["breakdown"] = breakdown(scoped_qs, date_range, group_by)

    return result
