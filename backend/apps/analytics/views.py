"""
The reporting endpoints: every figure the system reports, as JSON, and the
same figures as an Excel workbook or a PDF summary.

All of them read `reporting_ticket_qs`. Scope derives from the role on the JWT
and is never taken from a query param: a supervisor does not tell the server
which campus they run.
"""

from django.http import HttpResponse
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.common.roles import resolve_role
from apps.tickets.models import Ticket
from apps.tickets.scope import reporting_ticket_qs

from . import export
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


class ReportingView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]


class _ExportView(ReportingView):
    """A downloadable report over the caller's reporting scope and window."""

    roles = ()
    extension = ""
    content_type = ""

    def build(self, data) -> bytes:
        raise NotImplementedError

    def get(self, request):
        role = resolve_role(request)
        if role not in self.roles:
            raise PermissionDenied("This report is not available to your role.")
        data = export.report_data(request.user, role, resolve_window(request.query_params))
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
    """GET /analytics/export/pdf/ — the summary PDF. Manager, HOD and HOS."""

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
