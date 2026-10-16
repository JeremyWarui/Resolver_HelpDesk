"""
The Reports page's overview: the figures `metrics` computes, arranged as the
page reads them. Headline against the period before, what needs attention and
facility health; then for the manager campuses, trades and trades by campus,
and for an HOS or HOD their technicians and trades; then volume and holds.

Nothing here counts tickets itself; every number comes from `metrics`. What
lives here is the arrangement and the rules that pick what to point at, so the
page and its downloads say the same things.
"""

from apps.accounts.identity import display_name
from apps.accounts.models import TechnicianTrade
from apps.facilities.models import Facility
from apps.org.models import Campus, ServiceItem, Trade

from . import metrics

# What a building's repeated fault suggests, by trade code. A trade the admin
# adds later falls back to a plain "inspect" line.
SUGGESTIONS = {
    "ELEC": "Electrical survey",
    "PLUMB": "Plumbing overhaul",
    "MAS": "Masonry and drainage works",
    "CARP": "Carpentry repairs or replacement",
    "PAINT": "Repaint",
}
# The same fault this many times at one building in the period is a pattern.
REPEAT_AT = 3
# How many buildings Facility Health lists.
FACILITY_ROWS = 7
# A trade-by-campus cell, or a technician, needs this many tickets before its
# on-time share is news.
CELL_MIN_TICKETS = 10
INSIGHT_ROWS = 5
# Whose Reports page and dashboard this module arranges.
OVERVIEW_ROLES = ("manager", "hod", "hos")
# The roles whose reports cover every campus: they read the campus sections and
# may narrow to one campus. An HOS or HOD reads their technicians instead.
EVERY_CAMPUS_ROLES = ("admin", "manager")


def build(qs, window: dict, role: str = "manager", campus_ids=None) -> dict:
    """Every section of the overview, over `qs` (already scoped and narrowed).

    `campus_ids` are the campuses an HOS or HOD runs, so a technician with no
    work there this period still has a row.
    """
    every_campus = role in EVERY_CAMPUS_ROLES
    current = metrics.totals(qs, window)
    previous = metrics.totals(qs, metrics.previous_window(window))

    campus_rows = metrics.group(qs, window, ["campus"])
    trade_rows = metrics.group(qs, window, ["trade"])
    cells = metrics.group(qs, window, ["campus", "trade"])
    live_campus_rows = metrics.snapshot(qs, ["campus"])
    live_by_campus = {row["key"]: row for row in live_campus_rows}

    all_campuses = set(Campus.objects.values_list("id", flat=True))
    campuses = _campuses(
        campus_rows, live_campus_rows, metrics.technicians_by_campus(all_campuses)
    )
    gaps = _staffing_gaps(qs, metrics.staffed_pairs(all_campuses))
    facility_rows = facilities(qs, window)
    technicians = None if every_campus else technician_table(qs, window, campus_ids)

    data = {
        "target_pct": metrics.SLA_TARGET_PCT,
        "current": current,
        "previous": {
            "resolution_sla_pct": previous["resolution_sla_pct"],
            "resolution_seconds_avg": previous["resolution_seconds_avg"],
        },
        "unassigned_now": sum(row["unassigned"] for row in live_by_campus.values()),
        "at_hod_now": sum(row["at_hod"] for row in live_by_campus.values()),
        "insights": _insights(
            campuses, campus_rows, trade_rows, cells, gaps, facility_rows, technicians, qs, window
        ),
        "facilities": facility_rows,
        "trades": [
            {k: row[k] for k in ("key", "label", "total", "resolution_sla_pct", "rating_avg")}
            for row in trade_rows
        ],
        "trend": metrics.trend(qs, window, window["bucket"]),
        "bottlenecks": metrics.bottlenecks(qs),
    }
    if every_campus:
        data["campuses"] = campuses
        data["trade_by_campus"] = _trade_by_campus(cells)
    else:
        data["technicians"] = technicians
    return data


def campus_table(qs, window: dict) -> list:
    """The Campuses table over `qs` and `window`, as Reports and the dashboard show it."""
    campus_ids = set(Campus.objects.values_list("id", flat=True))
    return _campuses(
        metrics.group(qs, window, ["campus"]),
        metrics.snapshot(qs, ["campus"]),
        metrics.technicians_by_campus(campus_ids),
    )


def technician_table(qs, window: dict, campus_ids=None) -> list:
    """One row per technician: jobs raised in the window and assigned to them,
    how those went, and what they hold right now.

    Everyone covering `campus_ids` has a row, work or none; so does anyone
    else holding work in `qs`. Unassigned work belongs to nobody and is left out.
    """
    period = {row["key"]: row for row in metrics.group(qs, window, ["technician"])}
    live = {row["key"]: row for row in metrics.snapshot(qs, ["technician"]) if row["key"] is not None}
    names = {key: row["label"] for key, row in {**live, **period}.items()}
    if campus_ids:
        for link in TechnicianTrade.objects.filter(campus_id__in=campus_ids, user__is_active=True).select_related("user"):
            names.setdefault(link.user_id, display_name(link.user))
    rows = []
    for key, label in names.items():
        row, now = period.get(key, {}), live.get(key, {})
        rows.append({
            "key": key,
            "label": label,
            "total": row.get("total", 0),
            "open_now": now.get("open_now", 0),
            "overdue": now.get("overdue", 0),
            "resolution_sla_pct": row.get("resolution_sla_pct"),
            "resolution_seconds_avg": row.get("resolution_seconds_avg"),
            "rating_avg": row.get("rating_avg"),
        })
    return sorted(rows, key=lambda r: r["label"])


def _campuses(rows, live_rows, technicians) -> list:
    """One row per campus with work raised in the period or live now.

    `technicians` is everyone covering the campus, so a technician who works
    two campuses counts at both.
    """
    period = {row["key"]: row for row in rows}
    live = {row["key"]: row for row in live_rows}
    labels = {**{k: r["label"] for k, r in live.items()}, **{k: r["label"] for k, r in period.items()}}
    out = []
    for key, label in labels.items():
        row = period.get(key, {})
        now = live.get(key, {})
        staff = technicians.get(key, 0)
        out.append({
            "key": key,
            "label": label,
            "total": row.get("total", 0),
            "open_now": now.get("open_now", 0),
            "overdue": now.get("overdue", 0),
            "at_hod": now.get("at_hod", 0),
            "resolution_sla_pct": row.get("resolution_sla_pct"),
            "resolution_seconds_avg": row.get("resolution_seconds_avg"),
            "rating_avg": row.get("rating_avg"),
            "technicians": staff,
            "jobs_each": round(now.get("live_assigned", 0) / staff, 1) if staff else None,
        })
    return sorted(out, key=lambda c: c["label"])


def _trade_by_campus(cells) -> dict:
    """Tickets raised per trade at each campus, as a grid with totals."""
    trades = sorted({c["label_2"] for c in cells})
    by_campus = {}
    for cell in cells:
        row = by_campus.setdefault(cell["label"], {"campus": cell["label"], "counts": {}, "total": 0})
        row["counts"][cell["label_2"]] = cell["total"]
        row["total"] += cell["total"]
    rows = sorted(by_campus.values(), key=lambda r: r["campus"])
    return {
        "trades": trades,
        "rows": rows,
        "totals": {t: sum(r["counts"].get(t, 0) for r in rows) for t in trades},
        "total": sum(r["total"] for r in rows),
    }


def _staffing_gaps(qs, staffed) -> list:
    """Campus and trade pairs with live work and no technician to send."""
    gaps = [
        {"campus": row["label"], "trade": row["label_2"], "open": row["open_now"]}
        for row in metrics.snapshot(qs, ["campus", "trade"])
        if (row["key"], row["key_2"]) not in staffed
    ]
    return sorted(gaps, key=lambda g: (-g["open"], g["campus"], g["trade"]))


def facilities(qs, window) -> list:
    """Buildings with a pattern worth acting on, most urgent first.

    A building whose same fault came back REPEAT_AT times is flagged to act on,
    with a suggestion from that fault's trade. Without a repeat, a building is
    worth watching when it has twice the typical building's faults, or takes
    half as long again as the average to fix.
    """
    by_building = {row["key"]: row for row in metrics.group(qs, window, ["facility"])}
    if not by_building:
        return []
    by_trade = metrics.group(qs, window, ["facility", "trade"])
    by_item = metrics.group(qs, window, ["facility", "service_item"])
    live = {row["key"]: row for row in metrics.snapshot(qs, ["facility"])}
    item_trade = dict(
        ServiceItem.objects.filter(pk__in={r["key_2"] for r in by_item}).values_list("pk", "trade__code")
    )
    trade_codes = dict(Trade.objects.values_list("name", "code"))
    places = {
        f.pk: f for f in Facility.objects.filter(pk__in=by_building).select_related("campus", "facility_type")
    }

    counts = sorted(row["total"] for row in by_building.values())
    # The lower median: with few buildings, the upper one is the busiest itself.
    typical = counts[(len(counts) - 1) // 2]
    fix_times = [row["resolution_seconds_avg"] for row in by_building.values() if row["resolution_seconds_avg"]]
    average_fix = sum(fix_times) / len(fix_times) if fix_times else None

    rows = []
    for key, row in by_building.items():
        trades = sorted(
            ({"label": t["label_2"], "code": trade_codes.get(t["label_2"]), "total": t["total"]}
             for t in by_trade if t["key"] == key),
            key=lambda t: (-t["total"], t["label"]),
        )
        repeats = sorted(
            ({"label": i["label_2"], "total": i["total"], "trade": item_trade.get(i["key_2"])}
             for i in by_item if i["key"] == key and i["total"] >= REPEAT_AT),
            key=lambda i: (-i["total"], i["label"]),
        )
        fix = row["resolution_seconds_avg"]
        if repeats:
            flag = "act"
            # One line per trade the repeats fall in, most repeated first.
            lines = []
            for repeat in repeats:
                line = SUGGESTIONS.get(repeat["trade"]) or f"Inspect the {repeat['label'].lower()} work"
                if line not in lines:
                    lines.append(line)
            suggestion = "; ".join(lines[:2])
        elif len(counts) >= 3 and row["total"] >= max(2 * typical, REPEAT_AT + 2):
            flag, suggestion = "watch", "Many faults: inspect"
        elif fix and average_fix and fix >= 1.5 * average_fix:
            flag, suggestion = "watch", "Slow to fix: review the service"
        else:
            continue
        place = places.get(key)
        rows.append({
            "key": key,
            "label": row["label"],
            "campus": place.campus.name if place else "",
            "type": place.facility_type.name if place else "",
            "total": row["total"],
            "trades": trades,
            "repeats": [{"label": r["label"], "total": r["total"]} for r in repeats],
            "open_now": live.get(key, {}).get("open_now", 0),
            "resolution_seconds_avg": fix,
            "flag": flag,
            "suggestion": suggestion,
        })
    rows.sort(key=lambda r: (r["flag"] != "act", -r["total"], r["label"]))
    return rows[:FACILITY_ROWS]


def _insights(campuses, campus_rows, trade_rows, cells, gaps, facilities, technicians, qs, window) -> list:
    """Up to INSIGHT_ROWS plain sentences, each about something below target.

    Rules, in order: the weakest campus, the weakest trade-at-campus cell, the
    weakest technician (for an HOS or HOD), a trade with no technician, the
    building most in need, the campus with most work at the HOD, and the
    weakest trade. A rule with nothing to point at says nothing.
    """
    target = metrics.SLA_TARGET_PCT
    out = []

    measured = [c for c in campuses if c["resolution_sla_pct"] is not None]
    if len(measured) >= 2:
        worst = min(measured, key=lambda c: c["resolution_sla_pct"])
        if worst["resolution_sla_pct"] < target:
            before = {
                row["key"]: row["resolution_sla_pct"]
                for row in metrics.group(qs, metrics.previous_window(window), ["campus"])
            }.get(worst["key"])
            change = f", down from {before:g}%" if before is not None and before > worst["resolution_sla_pct"] else ""
            out.append({
                "kind": "campus",
                "text": f"{worst['label']} resolved {worst['resolution_sla_pct']:g}% on time, "
                        f"the lowest of {len(measured)} campuses{change}.",
            })

    weak_cells = [
        c for c in cells
        if c["total"] >= CELL_MIN_TICKETS and c["resolution_sla_pct"] is not None and c["resolution_sla_pct"] < target
    ]
    if weak_cells:
        cell = min(weak_cells, key=lambda c: c["resolution_sla_pct"])
        out.append({
            "kind": "trade",
            "text": f"{cell['label_2']} at {cell['label']}: {cell['total']} tickets, "
                    f"{cell['resolution_sla_pct']:g}% on time.",
        })

    measured_people = [
        t for t in technicians or ()
        if t["total"] >= CELL_MIN_TICKETS and t["resolution_sla_pct"] is not None
    ]
    if len(measured_people) >= 2:
        person = min(measured_people, key=lambda t: (t["resolution_sla_pct"], t["label"]))
        if person["resolution_sla_pct"] < target:
            out.append({
                "kind": "technician",
                "text": f"{person['label']}: {person['total']} jobs, {person['resolution_sla_pct']:g}% on time, "
                        f"the lowest of {len(measured_people)} technicians.",
            })

    if gaps:
        gap = gaps[0]
        more = f" Also {len(gaps) - 1} other trade-and-campus pair{'s' if len(gaps) > 2 else ''} with nobody to send." if len(gaps) > 1 else ""
        out.append({
            "kind": "staffing",
            "text": f"{gap['campus']} has no {gap['trade'].lower()} technician and "
                    f"{gap['open']} open {gap['trade'].lower()} job{'s' if gap['open'] != 1 else ''}.{more}",
        })

    acting = [f for f in facilities if f["flag"] == "act"]
    if acting:
        place = acting[0]
        repeat = place["repeats"][0]
        out.append({
            "kind": "facility",
            "text": f"{place['label']}, {place['campus']}: {repeat['label'].lower()} {repeat['total']} times "
                    f"this period. See Facility Health.",
        })

    escalated = [c for c in campuses if c["at_hod"]]
    if escalated and len(campuses) >= 2:
        most = max(escalated, key=lambda c: (c["at_hod"], c["label"]))
        out.append({
            "kind": "escalated",
            "text": f"{most['label']} has {most['at_hod']} job{'s' if most['at_hod'] != 1 else ''} with the HOD, "
                    f"the most of any campus.",
        })

    measured_trades = [t for t in trade_rows if t["resolution_sla_pct"] is not None]
    weak_trades = [t for t in measured_trades if t["resolution_sla_pct"] < target]
    said = {c["label_2"] for c in weak_cells} if len(campuses) == 1 else set()
    if len(measured_trades) >= 2 and weak_trades:
        trade = min(weak_trades, key=lambda t: t["resolution_sla_pct"])
        # With one campus, the trade-at-campus line has already said it.
        if trade["label"] not in said:
            out.append({
                "kind": "trade",
                "text": f"{trade['label']} resolved {trade['resolution_sla_pct']:g}% on time, the lowest trade.",
            })

    return out[:INSIGHT_ROWS]

