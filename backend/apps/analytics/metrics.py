"""
Every number this system reports, computed once.

Four functions, and they all take the same two arguments: a Ticket queryset
that is already scoped to the caller, and the window being reported on. What
varies is the shape that comes back — one dict of figures, rows by dimension,
rows by time bucket. `bottlenecks` is the exception: what is on hold is a
snapshot of now, so it takes no window.

The window is on `created_at`, so a figure means "of the tickets raised in this
period". Two are deliberately not windowed, because the words do not mean a
period: `open_backlog` and `overdue` describe right now, and the ticket raised
before the window opened is the worst one to leave out of them. `bottlenecks`
is the same, for the same reason. That does mean
a figure like `resolution_seconds_avg` only sees the tickets raised in the
period that are already finished, so a short window flatters a slow team; widen
the window rather than reading it as the whole truth.

Durations are reported in seconds. A `timedelta` is not JSON, and a client that
divides for itself is a client that eventually divides differently.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import (
    Avg,
    Count,
    DurationField,
    ExpressionWrapper,
    F,
    Min,
    OuterRef,
    Q,
    Subquery,
    Value,
)
from django.db.models.functions import (
    Coalesce,
    Concat,
    NullIf,
    Trim,
    TruncDay,
    TruncMonth,
    TruncWeek,
)
from django.utils import timezone

from apps.tickets.constants import (
    ACTIVE_STATUSES,
    ESCALATED_LEVELS,
    PENDING_REASON_LABELS,
    TERMINAL_STATUSES,
)
from apps.tickets.models import TicketLog
from apps.tickets.sla import q_met, q_overdue, q_settled_with_due

BUCKETS = {"day": TruncDay, "week": TruncWeek, "month": TruncMonth}

# The campuses are in Kenya, so a day in a trend runs midnight to midnight here,
# not in UTC; the exports print times in it too.
REPORT_TZ = ZoneInfo("Africa/Nairobi")

DEFAULT_DAYS = 30
MAX_DAYS = 3650

# The name as `accounts.identity.display_name_parts` builds it, so one person is
# not called two things. Trim collapses blanks to "", NullIf falls back to username.
_TECHNICIAN_NAME = Coalesce(
    NullIf(
        Trim(
            Concat(
                "assigned_to__first_name",
                Value(" "),
                "assigned_to__last_name",
            )
        ),
        Value(""),
    ),
    F("assigned_to__username"),
)

# Each dimension is the value to group on, the name to show, and the relation a
# row must have to be counted at all.
DIMENSIONS = {
    "trade": (F("trade__id"), F("trade__name"), None),
    "facility": (F("facility__id"), F("facility__name"), None),
    "campus": (F("requester_campus__id"), F("requester_campus__name"), None),
    "technician": (F("assigned_to__id"), _TECHNICIAN_NAME, "assigned_to"),
    "status": (F("status"), F("status"), None),
}


# ─── The window ─────────────────────────────────────────────────────────────


def _aware(value):
    """A datetime from whatever the caller sent, or None if it was not one."""
    try:
        dt = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
    return dt if timezone.is_aware(dt) else timezone.make_aware(dt)


def _days(value) -> int:
    try:
        return min(max(int(value), 1), MAX_DAYS)
    except (TypeError, ValueError):
        return DEFAULT_DAYS


def resolve_window(params) -> dict:
    """The period being reported on, and how finely a trend over it is cut.

    Every bad value falls back to the default window rather than raising. These
    arrive straight off the query string, and a client should not be able to
    500 the page by typing a date wrong.
    """
    date_from = _aware(params.get("date_from"))
    date_to = _aware(params.get("date_to"))
    if date_from and date_to and date_from <= date_to:
        window = {"from": date_from, "to": date_to}
    else:
        now = timezone.now()
        window = {"from": now - timedelta(days=_days(params.get("days"))), "to": now}

    bucket = params.get("bucket")
    window["bucket"] = bucket if bucket in BUCKETS else "day"
    return window


def raised_in(qs, window):
    """Narrow to the tickets raised inside the window."""
    return qs.filter(created_at__gte=window["from"], created_at__lte=window["to"])


def rated_in(qs, window):
    """Narrow to the tickets rated inside the window."""
    return qs.filter(rated_at__gte=window["from"], rated_at__lte=window["to"])


STARS = (5, 4, 3, 2, 1)


def ratings(qs) -> dict:
    """How a set of tickets was rated: how many, the average, how many with a
    comment, and how many at each star from five down."""
    rated = qs.filter(rating__isnull=False).order_by()
    figures = rated.aggregate(
        count=Count("id"),
        average=Avg("rating"),
        commented=Count("id", filter=~Q(rating_comment="")),
    )
    by_star = dict(rated.values_list("rating").annotate(n=Count("id")).order_by())
    return {
        "count": figures["count"],
        "average": round(figures["average"], 2) if figures["average"] is not None else None,
        "commented": figures["commented"],
        "stars": [{"stars": s, "count": by_star.get(s, 0)} for s in STARS],
    }


# ─── The figures ────────────────────────────────────────────────────────────


def _duration(expression):
    return ExpressionWrapper(expression, output_field=DurationField())


def measured(qs):
    """Attach the first-assignment timestamp, which response time is measured to.

    A subquery, not a join: a ticket with twelve log rows must still count once.
    `assigned` is written by both the claim and the first hand-over; a later
    reassignment writes `reassigned`, so this is the moment the ticket first
    reached somebody.
    """
    first_assigned = (
        TicketLog.objects.filter(ticket=OuterRef("pk"), event_type="assigned")
        .order_by("created_at")
        .values("created_at")[:1]
    )
    return qs.annotate(first_assigned_at=Subquery(first_assigned))


def _figure_set() -> dict:
    """The figures every total and every breakdown row carries.

    One definition, so a facility's resolution time and the campus total above
    it can never be computed two different ways. Only valid over a queryset that
    has been through `measured()`: two of these read `first_assigned_at`.
    """
    settled = Q(status__in=TERMINAL_STATUSES)
    responded = Q(first_assigned_at__isnull=False)
    return {
        "total": Count("id"),
        "open": Count("id", filter=Q(status__in=ACTIVE_STATUSES)),
        "settled": Count("id", filter=settled),
        "escalated": Count("id", filter=Q(current_level__in=ESCALATED_LEVELS)),
        "escalated_hos": Count("id", filter=Q(current_level="hos")),
        "escalated_hod": Count("id", filter=Q(current_level="hod")),
        "closed": Count("id", filter=Q(status="closed")),
        "closed_rated": Count("id", filter=Q(status="closed", rated_at__isnull=False)),
        # Holds come out: a job that waited three days on a part nobody could
        # supply did not take three days of anybody's work. Measured from the
        # clock's start, so a reopened ticket is timed on its latest attempt,
        # the same attempt its SLA outcome judges.
        "resolution_seconds_avg": Avg(
            _duration(F("resolved_at") - F("clock_started_at") - F("accumulated_pause")),
            filter=settled & Q(resolved_at__isnull=False),
        ),
        "resolution_sla_measurable": Count("id", filter=q_settled_with_due()),
        "resolution_sla_met": Count("id", filter=q_met()),
        "response_seconds_avg": Avg(
            _duration(F("first_assigned_at") - F("created_at")), filter=responded
        ),
        "response_sla_measurable": Count(
            "id", filter=responded & Q(response_due_at__isnull=False)
        ),
        "response_sla_met": Count(
            "id",
            filter=responded
            & Q(
                response_due_at__isnull=False,
                first_assigned_at__lte=F("response_due_at"),
            ),
        ),
        "rating_avg": Avg("rating"),
        "rating_count": Count("rating"),
    }


def _seconds(value):
    return round(value.total_seconds(), 1) if value is not None else None


def _pct(met, measurable):
    return round(met / measurable * 100, 1) if measurable else None


def _report(row: dict) -> dict:
    """Turn one row of raw aggregates into the shape that is reported.

    Durations become seconds, met-of-measurable pairs become percentages, and
    `missed` is named: a settled ticket that finished after its target. Overdue
    is a different word for a different thing and is not computed here.
    """
    met = row.pop("resolution_sla_met")
    measurable = row.pop("resolution_sla_measurable")
    row["missed"] = measurable - met
    row["resolution_sla_pct"] = _pct(met, measurable)
    # Completion is how much of the period's work is finished; the SLA
    # percentage is how much of the finished work was on time.
    row["completion_pct"] = _pct(row["settled"], row["total"])
    row["rated_pct"] = _pct(row.pop("closed_rated"), row["closed"])
    row["response_sla_pct"] = _pct(
        row.pop("response_sla_met"), row.pop("response_sla_measurable")
    )
    row["resolution_seconds_avg"] = _seconds(row["resolution_seconds_avg"])
    row["response_seconds_avg"] = _seconds(row["response_seconds_avg"])
    row["rating_avg"] = round(row["rating_avg"], 2) if row["rating_avg"] else None
    return row


def totals(qs, window: dict) -> dict:
    """The figures for the whole of the caller's scope over the window."""
    figures = _report(measured(raised_in(qs, window)).aggregate(**_figure_set()))

    # Not windowed. "Backlog" and "overdue" describe the section now, and the
    # ticket raised before the window opened is the worst one to drop.
    figures.update(
        qs.aggregate(
            open_backlog=Count("id", filter=Q(status__in=ACTIVE_STATUSES)),
            overdue=Count("id", filter=q_overdue()),
        )
    )
    return figures


def group(qs, window: dict, dimensions) -> list:
    """The same figures, cut by one or two dimensions.

    Two dimensions is what facility health is: tickets by facility *and* trade,
    so a row says which building keeps breaking and which craft it breaks for.
    An unknown dimension comes back empty rather than raising, so a stale client
    cannot 500 the page.
    """
    specs = [DIMENSIONS[d] for d in dimensions if d in DIMENSIONS]
    if not specs or len(specs) != len(dimensions):
        return []

    rows = raised_in(qs, window)
    for _, _, required in specs:
        if required:
            # A row missing the relation is a gap in the data, not a bucket
            # named "None": an unassigned ticket is not a technician's workload.
            rows = rows.filter(**{f"{required}__isnull": False})

    keys = {}
    for index, (key_expr, label_expr, _) in enumerate(specs):
        suffix = "" if index == 0 else f"_{index + 1}"
        keys[f"key{suffix}"] = key_expr
        keys[f"label{suffix}"] = label_expr

    return [
        _report(row)
        for row in measured(rows)
        .values(**keys)
        .annotate(**_figure_set())
        # Load-bearing, not cosmetic. `scoped_ticket_qs` orders by `-updated_at`,
        # and an explicit ordering field joins the GROUP BY, splitting every
        # bucket into one row per ticket. Ordering here replaces it. Biggest
        # bucket first is what a chart and a table both want anyway.
        .order_by("-total")
    ]


def bottlenecks(qs) -> list:
    """What is on hold right now, by reason, with the oldest hold in each.

    A snapshot, never windowed: `pending_reason` clears when work resumes, so
    no hold history is kept. Do not add a history column without deciding that.
    """
    rows = (
        qs.filter(status="pending")
        .exclude(pending_reason="")
        .values(key=F("pending_reason"))
        .annotate(total=Count("id"), since=Min("paused_at"))
        # Clears the scope queryset's `-updated_at`; see `group`.
        .order_by("-total")
    )
    return [
        {
            "key": row["key"],
            # Fall back to the code: a reason retired from the list still has
            # tickets behind it, and a report must not 500 over one.
            "label": PENDING_REASON_LABELS.get(row["key"], row["key"]),
            "total": row["total"],
            "since": row["since"],
        }
        for row in rows
    ]


def trend(qs, window: dict, bucket: str) -> list:
    """Volume over time, one row per bucket. Empty buckets are absent, not zero."""
    truncate = BUCKETS.get(bucket, TruncDay)
    return list(
        raised_in(qs, window)
        .annotate(bucket=truncate("created_at", tzinfo=REPORT_TZ))
        .values("bucket")
        .annotate(
            total=Count("id"),
            settled=Count("id", filter=Q(status__in=TERMINAL_STATUSES)),
        )
        # Also clears the scope queryset's `-updated_at`; see `group`.
        .order_by("bucket")
    )
