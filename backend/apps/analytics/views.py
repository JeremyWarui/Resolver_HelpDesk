"""
The reporting endpoints: every figure the system reports, as JSON, and the
same figures as an Excel workbook or a PDF summary.

All of them read `reporting_ticket_qs`. Scope derives from the role on the JWT
and is never taken from a query param: a supervisor does not tell the server
which campus they run.
"""

from django.http import HttpResponse
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.scope import visible_campuses
from apps.common.roles import resolve_role
from apps.org.models import Campus
from apps.tickets.models import Ticket
from apps.tickets.scope import reporting_ticket_qs
from apps.tickets.serializers import TicketReadSerializer

from . import dashboard, export, overview
from .metrics import bottlenecks, group, resolve_window, totals, trend
from .role_config import resolve_group_by


def scoped_for(request):
    """The caller's role, and every ticket they may be reported on.

    No role means a plain requester: their own tickets and nothing else.
    """
    role = resolve_role(request)
    if role:
        return role, reporting_ticket_qs(request.user, role)
    return role, Ticket.objects.filter(raised_by=request.user)


def campus_param(request):
    """The campus `?campus=<id>` names, or None without one. Not a campus is a 400."""
    raw = request.query_params.get("campus")
    if raw is None:
        return None
    campus = Campus.objects.filter(pk=int(raw)).first() if raw.isascii() and raw.isdigit() else None
    if campus is None:
        raise ValidationError({"campus": "Not a campus."})
    return campus


class ReportingView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]


class _ExportView(ReportingView):
    """A downloadable report over the caller's reporting scope and window.

    `?campus=<id>` narrows a report that covers every campus (admin, manager)
    to one; anyone else already reads one campus, and asking is a 400.
    """

    roles = ()
    extension = ""
    content_type = ""

    def build(self, data) -> bytes:
        raise NotImplementedError

    def get(self, request):
        role = resolve_role(request)
        if role not in self.roles:
            raise PermissionDenied("This report is not available to your role.")
        campus = campus_param(request)
        if campus and role not in overview.EVERY_CAMPUS_ROLES:
            raise ValidationError({"campus": "Only a report over every campus narrows to one."})
        data = export.report_data(
            request.user, role, resolve_window(request.query_params), campus, _campus_ids(request, role)
        )
        response = HttpResponse(self.build(data), content_type=self.content_type)
        response["Content-Disposition"] = (
            f'attachment; filename="{export.filename(data, self.extension)}"'
        )
        return response


class ExcelExportView(_ExportView):
    """GET /analytics/export/xlsx/ — the workbook. Every role with reports."""

    roles = export.XLSX_ROLES
    extension = "xlsx"
    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    def build(self, data):
        return export.build_workbook(data)


class PdfExportView(_ExportView):
    """GET /analytics/export/pdf/ — the summary PDF. Manager, HOD, HOS and technician."""

    roles = export.PDF_ROLES
    extension = "pdf"
    content_type = "application/pdf"

    def build(self, data):
        return export.build_pdf(data)


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


def _campus_ids(request, role):
    """The campuses an HOS or HOD runs; None for a role over every campus."""
    if role in overview.EVERY_CAMPUS_ROLES:
        return None
    return list(visible_campuses(request.user, role).values_list("id", flat=True))


class OverviewView(ReportingView):
    """GET /analytics/overview/: the Reports page of the manager, HOD and HOS.

    Same period rules as /analytics/. `?campus=<id>` narrows the manager's page
    to one campus; an id that is not a campus is a 400, and so is asking from
    a role that reads one campus already.
    """

    def get(self, request):
        role, qs = scoped_for(request)
        if role not in overview.OVERVIEW_ROLES:
            raise PermissionDenied("This report is not available to your role.")
        window = resolve_window(request.query_params)

        campus = campus_param(request)
        if campus and role not in overview.EVERY_CAMPUS_ROLES:
            raise ValidationError({"campus": "Only a report over every campus narrows to one."})
        if campus:
            qs = qs.filter(requester_campus=campus)

        data = overview.build(qs, window, role, _campus_ids(request, role))
        data["range"] = {"from": window["from"].isoformat(), "to": window["to"].isoformat()}
        data["campus"] = {"id": campus.pk, "name": campus.name} if campus else None
        return Response(data)


class DashboardView(ReportingView):
    """GET /analytics/dashboard/: the dashboard of the manager, HOD and HOS.

    `?trend_days=` and `?open_days=` set the two charts' periods (7, 30 or 90);
    any other value falls back to the week and to all open work. An HOS or HOD
    also gets the tickets waiting longest for a technician, in the list shape
    with `waiting_since`: when the clock last started, so a reopened ticket
    counts from its reopening.
    """

    WAITING_ROWS = 5

    def get(self, request):
        role, qs = scoped_for(request)
        if role not in overview.OVERVIEW_ROLES:
            raise PermissionDenied("This dashboard is not available to your role.")
        params = request.query_params
        # The dashboard reads the caller's whole scope; Reports is where a campus narrows.
        if "campus" in params:
            raise ValidationError({"campus": "The dashboard does not narrow to a campus."})
        data = dashboard.build(
            qs,
            trend_days=dashboard.period(params.get("trend_days")) or dashboard.DAYS,
            open_days=dashboard.period(params.get("open_days")),
            role=role,
            campus_ids=_campus_ids(request, role),
        )
        if role not in overview.EVERY_CAMPUS_ROLES:
            first = list(dashboard.waiting(qs)[: self.WAITING_ROWS])
            rows = TicketReadSerializer(first, many=True, context={"request": request}).data
            data["waiting"] = {
                "count": data["live"]["waiting"],
                "rows": [
                    {**row, "waiting_since": ticket.clock_started_at.isoformat()}
                    for row, ticket in zip(rows, first)
                ],
            }
        return Response(data)
