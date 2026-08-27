"""
The Excel export: one workbook, a Summary sheet and the tickets behind it.

The Summary sheet is `aggregate()` over the same scope and window as the
Tickets sheet beside it, and the queryset is scoped before a row is written.
"""

from datetime import timedelta
from io import BytesIO

import openpyxl
from django.http import HttpResponse
from django.utils import timezone
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.identity import display_name
from apps.analytics.services import aggregate, created_window, resolve_date_range
from apps.common.roles import resolve_role
from apps.tickets.models import Ticket
from apps.tickets.scope import scoped_ticket_qs

_HEADER_FILL = PatternFill("solid", fgColor="1E40AF")
_HEADER_FONT = Font(bold=True, color="FFFFFF")
_HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)

_TIMEFRAME_OFFSETS = {"day": 1, "week": 7, "month": 30, "quarter": 90, "year": 365}


def _style_headers(ws, num_cols: int) -> None:
    """Give the header row the house style."""
    ws.row_dimensions[1].height = 20
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = _HEADER_ALIGN


def _auto_width(ws) -> None:
    """Widen every column to its longest cell, capped so one description cannot own the sheet."""
    for col_cells in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col_cells), default=10)
        ws.column_dimensions[get_column_letter(col_cells[0].column)].width = min(
            max_len + 2, 50
        )


def _fmt(dt) -> str:
    """A datetime as the workbook renders it; empty string for None."""
    return dt.strftime("%Y-%m-%d %H:%M") if dt else ""


def _build_date_range_params(request) -> dict:
    """Translate the report's own params into the vocabulary `resolve_date_range` reads.

    Returns {} for timeframe='all'. That empty dict is the signal to apply no
    date filter, and it has to be checked for: handing it straight to
    `resolve_date_range` would quietly produce a thirty-day window.
    """
    params: dict = {}
    start = request.query_params.get("start_date")
    end = request.query_params.get("end_date")
    timeframe = request.query_params.get("timeframe", "all")

    if start and end:
        params["date_from"] = start
        params["date_to"] = end
    elif timeframe in _TIMEFRAME_OFFSETS:
        params["days"] = _TIMEFRAME_OFFSETS[timeframe]

    return params


def _scoped_qs(request, role):
    """Every ticket the caller may export. A caller with no role gets their own."""
    if role:
        return scoped_ticket_qs(request.user, role)
    return Ticket.objects.filter(raised_by=request.user)


def _report_date_range(request, scoped_qs):
    """The window both sheets cover.

    "All time" is the case that needs care: `resolve_date_range` defaults to
    thirty days when given nothing, so the window instead stretches back to the
    earliest ticket in scope.
    """
    params = _build_date_range_params(request)
    if params:
        return resolve_date_range(params)

    earliest = (
        scoped_qs.order_by("created_at").values_list("created_at", flat=True).first()
    )
    date_from = earliest or (timezone.now() - timedelta(days=30))
    return resolve_date_range(
        {"date_from": date_from.isoformat(), "date_to": timezone.now().isoformat()}
    )


def _sheet_summary(ws, scoped_qs, date_range) -> None:
    """The Summary tab: the reported figures, straight from `aggregate()`."""
    data = aggregate(scoped_qs, date_range)

    label_fill = PatternFill("solid", fgColor="EFF6FF")

    def hours(seconds):
        return round(seconds / 3600, 1) if seconds is not None else ""

    rows = [
        ("Period from", _fmt(date_range["date_from"])),
        ("Period to", _fmt(date_range["date_to"])),
        ("Tickets raised", data["created"]),
        ("Tickets resolved", data["resolved"]),
        ("Open backlog", data["open_backlog"]),
        ("Overdue now", data["breached"]),
        ("Escalated", data["escalated_count"]),
        ("Response SLA met (%)", data["response_sla_pct"] or ""),
        ("Resolution SLA met (%)", data["resolution_sla_pct"] or ""),
        ("Average response time (hours)", hours(data["response_time_avg_seconds"])),
        ("Average resolution time (hours)", hours(data["resolution_time_avg_seconds"])),
        ("Average rating", data["csat"] or ""),
        ("Ratings received", data["feedback_count"]),
    ]

    ws.append(["Metric", "Value"])
    _style_headers(ws, 2)
    for label, value in rows:
        ws.append([label, value])
        ws.cell(row=ws.max_row, column=1).fill = label_fill

    ws.append([])
    ws.append(["Tickets by status", ""])
    ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
    for row in data["status_distribution"]:
        ws.append([row["status"], row["count"]])

    ws.append([])
    ws.append(["Tickets by trade", ""])
    ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
    for row in data["demand"]["by_sub_section"]:
        ws.append([row["label"], row["total"]])

    ws.append([])
    ws.append(["Tickets by facility", ""])
    ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
    for row in data["demand"]["by_facility"]:
        ws.append([row["label"], row["total"]])

    _auto_width(ws)


def _sheet_tickets(ws, qs) -> None:
    """The Tickets tab: one row per ticket, with the dates the figures are drawn from."""
    headers = [
        "Ticket No",
        "Status",
        "Priority",
        "Level",
        "Raised By",
        "Campus",
        "Trade",
        "Service Item",
        "Facility",
        "Assigned To",
        "Description",
        "Resolution Due",
        "Resolved At",
        "Closed At",
        "Created At",
        "Total Paused (mins)",
    ]
    ws.append(headers)
    _style_headers(ws, len(headers))
    ws.freeze_panes = "A2"

    tickets = qs.select_related(
        "raised_by",
        "requester_campus",
        "sub_section",
        "service_item",
        "priority",
        "assigned_to",
        "location__facility",
    )

    for t in tickets:
        # A ticket may predate the location rule and have no location row.
        location = getattr(t, "location", None)
        facility = location.facility if location else None
        ws.append(
            [
                t.ticket_no,
                t.get_status_display(),
                t.priority.name if t.priority_id else "",
                t.get_current_level_display(),
                display_name(t.raised_by) if t.raised_by_id else "",
                t.requester_campus.name if t.requester_campus_id else "",
                t.sub_section.name if t.sub_section_id else "",
                t.service_item.name if t.service_item_id else "",
                facility.name if facility else "",
                # Never blank: in a spreadsheet a blank reads as missing data.
                display_name(t.assigned_to) if t.assigned_to_id else "Unassigned",
                (t.description or "")[:200],
                _fmt(t.resolution_due_at),
                _fmt(t.resolved_at),
                _fmt(t.closed_at),
                _fmt(t.created_at),
                (
                    int(t.accumulated_pause.total_seconds() / 60)
                    if t.accumulated_pause
                    else 0
                ),
            ]
        )

    _auto_width(ws)


class GenerateReportView(APIView):
    """GET /reports/generate/ — build the workbook and return it as a download."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Assemble the workbook over the caller's scope."""
        role = resolve_role(request)
        scoped_qs = _scoped_qs(request, role)
        date_range = _report_date_range(request, scoped_qs)

        qs = created_window(scoped_qs, date_range)
        if campus_id := request.query_params.get("campus_id"):
            qs = qs.filter(requester_campus_id=campus_id)
        if technician_id := request.query_params.get("technician_id"):
            qs = qs.filter(assigned_to_id=technician_id)

        wb = openpyxl.Workbook()
        summary = wb.active
        summary.title = "Summary"
        _sheet_summary(summary, scoped_qs, date_range)
        _sheet_tickets(wb.create_sheet("Tickets"), qs)

        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)

        response = HttpResponse(
            buf.read(),
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )
        response["Content-Disposition"] = 'attachment; filename="tickets_report.xlsx"'
        return response
