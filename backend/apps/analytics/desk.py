"""
The admin's dashboard: what needs setting up, and whether the work is moving.

Every card answers a question the admin can fix from another page: is the
escalation check scheduled, which trades have nobody to send, which accounts
cannot work, is email set up, what has waited too long, who has gone quiet,
and what people have said about the system. The figures come from the
modules that own them; this one only gathers them.
"""

from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Prefetch
from django.utils import timezone

from apps.accounts import health
from apps.accounts.identity import display_name
from apps.accounts.models import CustomUser, RoleAssignment, TechnicianTrade
from apps.facilities.models import Facility
from apps.org.models import Campus
from apps.system_feedback.models import SystemFeedback
from apps.tickets import escalation
from apps.tickets.models import Ticket, TicketLog

from . import cover

# Open with nobody sent for this long is waiting too long.
WAITING_TOO_LONG = timedelta(hours=24)
# A technician who has touched no ticket in this long has gone quiet.
QUIET_AFTER = timedelta(days=7)
FEEDBACK_ROWS = 4


def build(now=None) -> dict:
    """Every section of the admin's dashboard, over every campus."""
    now = now or timezone.now()
    campus_ids = list(Campus.objects.values_list("id", flat=True))
    grid = cover.build(Ticket.objects.all(), campus_ids)
    state, last = escalation.schedule_state(now)
    due = [after for _, _, after in escalation.preview()]
    to_fix = health.accounts_to_fix()
    unread = SystemFeedback.objects.filter(reviewed=False)

    return {
        "escalation": {
            "state": state,
            "last_finished_at": last.finished_at if last else None,
            "due_hos": due.count("hos"),
            "due_hod": due.count("hod"),
        },
        "cover": {"gaps": grid["gaps"], "gap_campuses": grid["gap_campuses"], "stuck": grid["stuck"]},
        "accounts_to_fix": {
            "count": len(to_fix),
            "by_problem": {
                code: sum(1 for _, codes in to_fix if code in codes) for code in health.PROBLEMS
            },
        },
        "email_configured": bool(settings.EMAIL_HOST),
        "waiting_too_long": Ticket.objects.filter(
            status="open", clock_started_at__lt=now - WAITING_TOO_LONG
        ).count(),
        "technicians": _technicians(now),
        "feedback": {
            "unread": unread.count(),
            "by_category": {
                code: unread.filter(category=code).count() for code, _ in SystemFeedback.CATEGORIES
            },
            "latest": [
                {
                    "id": f.pk,
                    "category": f.category,
                    "message": f.message,
                    "author_role": f.author_role,
                    "created_at": f.created_at,
                }
                for f in unread.order_by("-created_at")[:FEEDBACK_ROWS]
            ],
        },
        "campuses": _campuses(grid),
    }


def _technicians(now):
    """How many working technicians there are, and who has touched no ticket lately."""
    working = list(
        CustomUser.objects.filter(is_active=True, pk__in=TechnicianTrade.objects.values("user_id"))
        .prefetch_related(Prefetch(
            "technician_trades", queryset=TechnicianTrade.objects.select_related("campus", "trade"),
        ))
        .order_by("first_name", "last_name", "username")
    )
    busy = set(
        TicketLog.objects.filter(created_at__gte=now - QUIET_AFTER, actor__isnull=False)
        .values_list("actor_id", flat=True)
        .distinct()
    )
    quiet = [u for u in working if u.pk not in busy]
    return {
        "total": len(working),
        "active": len(working) - len(quiet),
        "quiet": [
            {
                "id": u.pk,
                "name": display_name(u),
                "where": ", ".join(sorted({f"{t.campus.name} {t.trade.name}" for t in u.technician_trades.all()})),
            }
            for u in quiet
        ],
    }


def _campuses(grid):
    """Each campus: who holds its two posts, its people and buildings, and its gaps."""
    trade_names = {t["id"]: t["name"] for t in grid["trades"]}
    facilities = {
        row["campus_id"]: row["n"]
        for row in Facility.objects.values("campus_id").annotate(n=Count("id")).order_by()
    }
    # Who holds each post, as `post_holder` reads it, in one query for every campus.
    holders = {
        (a.campus_id, a.role): display_name(a.user)
        for a in RoleAssignment.objects.filter(role__in=("hos", "hod"), user__is_active=True)
        .select_related("user")
        .order_by("-pk")
    }
    rows = []
    for c in grid["campuses"]:
        cells = [cell for cell in grid["cells"] if cell["campus"] == c["id"]]
        gaps = [cell for cell in cells if not cell["technicians"]]
        rows.append({
            "id": c["id"],
            "name": c["name"],
            "hod": holders.get((c["id"], "hod")),
            "hos": holders.get((c["id"], "hos")),
            "technicians": c["technicians"],
            "facilities": facilities.get(c["id"], 0),
            "gaps": [trade_names[cell["trade"]] for cell in gaps],
            "stuck": sum(cell["open"] for cell in gaps),
        })
    return rows

