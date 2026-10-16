"""
The manager's dashboard: the operation right now and this week, at a glance.

Live work as it stands, the last seven Kenyan days against the seven before,
raised and resolved day by day, each campus's live work by stage, and the
Reports page's Campuses table over the week. Every number comes from
`metrics`; this module only arranges them. The period is fixed: Reports is
where a manager reads other periods.
"""

from datetime import timedelta

from django.utils import timezone

from apps.org.models import Campus

from . import metrics, overview

DAYS = 7
_LIVE = ("open_now", "waiting", "with_technician", "on_hold", "overdue", "at_hod")
_STAGES = ("open_now", "waiting", "with_technician", "on_hold")
_WEEK = ("total", "resolution_sla_pct", "resolution_seconds_avg", "rating_avg", "rating_count")


def week(now=None) -> dict:
    """The last DAYS Kenyan days, today included, up to now."""
    now = now or timezone.now()
    midnight = now.astimezone(metrics.REPORT_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    return {"from": midnight - timedelta(days=DAYS - 1), "to": now, "bucket": "day"}


def build(qs, now=None) -> dict:
    """Every section of the dashboard over `qs`, which is already scoped."""
    window = week(now)
    current = metrics.totals(qs, window)
    previous = metrics.totals(qs, metrics.previous_window(window))

    by_campus = {row["key"]: row for row in metrics.snapshot(qs, ["campus"])}

    return {
        "week": {"from": window["from"].isoformat(), "to": window["to"].isoformat()},
        "live": {k: sum(row[k] for row in by_campus.values()) for k in _LIVE},
        "this_week": {k: current[k] for k in _WEEK},
        "last_week": {k: previous[k] for k in _WEEK},
        "days": _days(qs, window),
        "target_pct": metrics.SLA_TARGET_PCT,
        "campus_table": overview.campus_table(qs, window),
        "campuses": [
            {
                "key": c.pk,
                "label": c.name,
                **{k: by_campus.get(c.pk, {}).get(k, 0) for k in _STAGES},
            }
            for c in Campus.objects.order_by("name")
        ],
    }


def _days(qs, window) -> list:
    """Raised and resolved on each day of the window, a row for every day."""
    raised = {row["bucket"].date(): row["total"] for row in metrics.trend(qs, window, "day")}
    resolved = {row["day"].date(): row["total"] for row in metrics.resolved_by_day(qs, window)}
    first = window["from"].date()
    return [
        {"day": (first + timedelta(days=n)).isoformat(),
         "raised": raised.get(first + timedelta(days=n), 0),
         "resolved": resolved.get(first + timedelta(days=n), 0)}
        for n in range(DAYS)
    ]
