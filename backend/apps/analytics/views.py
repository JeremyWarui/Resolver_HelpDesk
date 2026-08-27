"""
The analytics endpoints. Two of them, both thin.

A view reads the role from the JWT, gets the scoped queryset, calls into
`services` and returns the result. Scope is never re-derived here.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.common.roles import resolve_role
from apps.tickets.models import Ticket
from apps.tickets.scope import scoped_ticket_qs

from .role_config import resolve_group_by
from .services import aggregate, breakdown, resolve_date_range, technician_load


class BaseAnalyticsView(APIView):
    """The preamble every analytics endpoint runs: role, scope, window."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def scope_and_range(self, request):
        """Return (role, scoped_qs, date_range)."""
        role = resolve_role(request)
        # No role means a plain requester: their own tickets and nothing else.
        qs = (
            scoped_ticket_qs(request.user, role)
            if role
            else Ticket.objects.filter(raised_by=request.user)
        )
        return role, qs, resolve_date_range(request.query_params)


def _range_meta(date_range):
    """The window, echoed back so a chart can label its own axis."""
    return {
        "from": date_range["date_from"].isoformat(),
        "to": date_range["date_to"].isoformat(),
    }


class AnalyticsView(BaseAnalyticsView):
    """GET /analytics/ — the whole figure set, in one call, for every role.

    One endpoint because the aggregate is the expensive part and everything a
    dashboard renders comes out of a single run of it. `group_by` is the one
    thing a client may steer, and it is checked against the role's list first.
    """

    def get(self, request):
        role, scoped_qs, date_range = self.scope_and_range(request)
        group_by = resolve_group_by(role, request.query_params.get("group_by"))
        data = aggregate(scoped_qs, date_range, group_by)

        return Response(
            {
                "scope": {"role": role, "group_by": group_by},
                "range": _range_meta(date_range),
                "headline": {
                    key: data[key]
                    for key in (
                        "open_backlog",
                        "created",
                        "resolved",
                        "response_sla_pct",
                        "resolution_sla_pct",
                        "response_time_avg_seconds",
                        "resolution_time_avg_seconds",
                        "breached",
                        "escalated_count",
                        "csat",
                        "feedback_count",
                    )
                },
                "status_distribution": data["status_distribution"],
                "breakdown": {"dimension": group_by, "rows": data["breakdown"]},
                "demand": data["demand"],
                # Live, not windowed: a supervisor asks who is carrying what now.
                "technician_load": technician_load(scoped_qs),
            }
        )


class BreakdownView(BaseAnalyticsView):
    """GET /analytics/breakdown/?group_by= — one dimension's rows, no figures."""

    def get(self, request):
        role, scoped_qs, date_range = self.scope_and_range(request)
        group_by = resolve_group_by(role, request.query_params.get("group_by"))
        return Response(
            {
                "range": _range_meta(date_range),
                "dimension": group_by,
                "rows": breakdown(scoped_qs, date_range, group_by),
            }
        )
