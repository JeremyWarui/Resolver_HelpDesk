"""
The manager's dashboard: the operation right now and this week, at a glance.

Live work as it stands, the last seven Kenyan days against the seven before,
raised and resolved over a chosen period, each campus's live work by stage,
the Reports page's Campuses table and the buildings with faults that keep
coming back. Every number comes from `metrics` or `overview`; this module only
arranges them. Reports is where a manager reads any other period in full.
"""

from datetime import timedelta

from django.utils import timezone

from apps.org.models import Campus

from . import metrics, overview

DAYS = 7
# The periods the two charts offer, in days, and how the trend cuts each.
PERIODS = {7: "day", 30: "day", 90: "week"}
FACILITY_ROWS = 5
_LIVE = ("open_now", "waiting", "with_technician", "on_hold", "overdue", "at_hod")
_STAGES = ("open_now", "waiting", "with_technician", "on_hold")
_WEEK = ("total", "resolution_sla_pct", "resolution_seconds_avg", "rating_avg", "rating_count")


def period(value) -> int | None:
    """A chart period off the query string: one of PERIODS, or None."""
    try:
        days = int(value)
    except (TypeError, ValueError):
        return None
    return days if days in PERIODS else None


def week(now=None, days: int = DAYS) -> dict:
    """The last `days` Kenyan days, today included, up to now."""
    now = now or timezone.now()
    midnight = now.astimezone(metrics.REPORT_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    return {"from": midnight - timedelta(days=days - 1), "to": now, "bucket": "day"}


def build(qs, trend_days: int = DAYS, open_days: int | None = None, now=None) -> dict:
    """Every section of the dashboard over `qs`, which is already scoped.

    `trend_days` is the raised-and-resolved chart's period; `open_days`, when
    given, narrows open work by campus to work raised in that many days.
    """
    window = week(now)
    current = metrics.totals(qs, window)
    previous = metrics.totals(qs, metrics.previous_window(window))

    live = metrics.snapshot(qs, ["campus"])
    open_qs = qs.filter(created_at__gte=week(now, open_days)["from"]) if open_days else qs
    by_campus = {row["key"]: row for row in (metrics.snapshot(open_qs, ["campus"]) if open_days else live)}

    return {
        "week": {"from": window["from"].isoformat(), "to": window["to"].isoformat()},
        "live": {k: sum(row[k] for row in live) for k in _LIVE},
        "this_week": {k: current[k] for k in _WEEK},
        "last_week": {k: previous[k] for k in _WEEK},
        "trend": {"days": trend_days, "bucket": PERIODS[trend_days], "rows": _trend(qs, week(now, trend_days), trend_days)},
        "open_days": open_days,
        "campuses": [
            {"key": c.pk, "label": c.name, **{k: by_campus.get(c.pk, {}).get(k, 0) for k in _STAGES}}
            for c in Campus.objects.order_by("name")
        ],
        "target_pct": metrics.SLA_TARGET_PCT,
        "campus_table": overview.campus_table(qs, window),
        # The Reports page's first rows; with no flag column to explain its order, most faults first.
        "facilities": sorted(overview.facilities(qs, window)[:FACILITY_ROWS], key=lambda f: -f["total"]),
    }


def _trend(qs, window, days: int) -> list:
    """Raised and resolved in each bucket of the window, a row for every bucket.

    A week bucket is seven days counted from the window's first day, so the
    last one may be short.
    """
    raised = {row["bucket"].date(): row["total"] for row in metrics.trend(qs, window, "day")}
    resolved = {row["day"].date(): row["total"] for row in metrics.resolved_by_day(qs, window)}
    first = window["from"].date()
    step = 7 if PERIODS[days] == "week" else 1
    rows = []
    for start in range(0, days, step):
        span = [first + timedelta(days=n) for n in range(start, min(start + step, days))]
        rows.append({
            "start": span[0].isoformat(),
            "raised": sum(raised.get(d, 0) for d in span),
            "resolved": sum(resolved.get(d, 0) for d in span),
        })
    return rows
