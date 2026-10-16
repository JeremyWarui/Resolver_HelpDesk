"""
Cover by trade: who can work each active trade at each campus.

A technician sees a ticket only where the campus and the trade both match, so
a (campus, trade) pair with nobody on it is a service a requester can pick that
no one will ever see. The admin's dashboard counts these gaps; the Technicians
page draws them as a grid.
"""

from apps.org.models import Campus, Trade

from . import metrics


def build(qs, campus_ids) -> dict:
    """The grid over `campus_ids`, with the open work in `qs` (already scoped) in each cell."""
    campuses = list(Campus.objects.filter(pk__in=campus_ids).order_by("name"))
    trades = list(Trade.objects.filter(is_active=True).order_by("name"))
    people = metrics.technicians_by_pair(campus_ids)
    open_work = {
        (row["key"], row["key_2"]): row["open_now"]
        for row in metrics.snapshot(qs.filter(requester_campus_id__in=campus_ids), ["campus", "trade"])
    }
    staff = metrics.technicians_by_campus(campus_ids)

    cells = [
        {
            "campus": c.pk,
            "trade": t.pk,
            "technicians": people.get((c.pk, t.pk), 0),
            "open": open_work.get((c.pk, t.pk), 0),
        }
        for t in trades
        for c in campuses
    ]
    gaps = [cell for cell in cells if not cell["technicians"]]
    return {
        "campuses": [{"id": c.pk, "name": c.name, "technicians": staff.get(c.pk, 0)} for c in campuses],
        "trades": [{"id": t.pk, "name": t.name, "code": t.code} for t in trades],
        "cells": cells,
        "gaps": len(gaps),
        "gap_campuses": len({cell["campus"] for cell in gaps}),
        "stuck": sum(cell["open"] for cell in gaps),
    }
