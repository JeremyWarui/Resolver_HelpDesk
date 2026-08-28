"""
The reporting endpoint: every figure the system reports, as JSON.

It starts from `scoped_for`, which is the only place it decides whose tickets
it is looking at. Scope derives from the role on the JWT and is never taken
from a query param: a supervisor does not tell the server which campus they
run.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.common.roles import resolve_role
from apps.tickets.models import Ticket
from apps.tickets.scope import scoped_ticket_qs

from .metrics import bottlenecks, group, resolve_window, totals, trend
from .role_config import resolve_group_by


def scoped_for(request):
    """The caller's role, and every ticket they may be reported on.

    No role means a plain requester: their own tickets and nothing else.
    """
    role = resolve_role(request)
    if role:
        return role, scoped_ticket_qs(request.user, role)
    return role, Ticket.objects.filter(raised_by=request.user)


class ReportingView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]


class AnalyticsView(ReportingView):
    """GET /analytics/ — every reported figure, in one call, for every role.

    One endpoint because a dashboard renders all of it at once. `group_by` is
    the one thing a client may steer, and `resolve_group_by` checks it against
    the role's list before it reaches the engine.
    """

    def get(self, request):
        role, qs = scoped_for(request)
        window = resolve_window(request.query_params)
        dimensions = resolve_group_by(role, request.query_params.get("group_by"))

        return Response(
            {
                "scope": {"role": role, "group_by": dimensions},
                "range": {
                    "from": window["from"].isoformat(),
                    "to": window["to"].isoformat(),
                    "bucket": window["bucket"],
                },
                "totals": totals(qs, window),
                "breakdown": group(qs, window, dimensions),
                "bottlenecks": bottlenecks(qs),
                "trend": trend(qs, window, window["bucket"]),
            }
        )
