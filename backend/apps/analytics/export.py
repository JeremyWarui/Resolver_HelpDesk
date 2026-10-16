"""
The downloadable reports: an Excel workbook and a PDF summary.

Both are drawn from `report_data`, which reads every figure from `metrics` over
`reporting_ticket_qs`, so a download says exactly what the reports page says
for the same role and period. Times are shown in Kenyan time.
"""

import io
import re
from datetime import timedelta
from xml.sax.saxutils import escape

from django.utils import timezone

from apps.accounts.identity import display_name
from apps.accounts.models import RoleAssignment
from apps.facilities.models import Facility
from apps.tickets.constants import LEVELS, PENDING_REASON_LABELS, STATUSES
from apps.tickets.scope import reporting_ticket_qs
from apps.tickets.sla import sla_outcome

from .metrics import REPORT_TZ, bottlenecks, group, measured, raised_in, totals, trend

# KSG brand colours for the reports. White on KSG Brown is 5.70:1.
KSG_BROWN = "7F622C"
KSG_BROWN_DEEP = "3E2C12"
KSG_GREEN_DARK = "6F7A00"

# Who may download which format.
XLSX_ROLES = ("admin", "manager", "hod", "hos", "technician")
PDF_ROLES = ("manager", "hod", "hos", "technician")

# "On hold", as the app says it, rather than the model's "Pending".
STATUS_LABELS = {**dict(STATUSES), "pending": "On hold"}
LEVEL_LABELS = dict(LEVELS)

# The columns of every breakdown sheet and table, in order: (key, heading).
BREAKDOWN_COLUMNS = [
    ("total", "Raised"),
    ("settled", "Settled"),
    ("open", "Open"),
    ("completion_pct", "Completion %"),
    ("response_seconds_avg", "Avg response"),
    ("resolution_seconds_avg", "Avg resolution"),
    ("resolution_sla_pct", "Resolution SLA %"),
    ("response_sla_pct", "Response SLA %"),
    ("missed", "Missed"),
    ("escalated", "Escalated"),
    ("rating_avg", "Rating"),
    ("rating_count", "Ratings"),
]


def scope_label(user, role):
    """Who and what a report covers, said in words."""
    if role in ("admin", "manager"):
        return "Every campus"
    if role == "technician":
        return f"Jobs assigned to {display_name(user)}"
    assignment = RoleAssignment.objects.filter(user=user).select_related("campus").first()
    if assignment and assignment.campus:
        return f"{assignment.campus.name} campus"
    return "Your campus"


# Characters Excel refuses in a cell, which would fail the whole download.
_ILLEGAL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
# A cell starting with one of these is read by Excel as a formula.
_FORMULA_LEADS = ("=", "+", "-", "@", "\t", "\r")


def cell_text(value):
    """Text that is safe in a spreadsheet cell, from anything a person typed.

    Strips the control characters Excel rejects, and quotes a leading formula
    character so `=HYPERLINK(...)` in a comment stays text.
    """
    if not isinstance(value, str):
        return value
    value = _ILLEGAL.sub("", value)
    return "'" + value if value.startswith(_FORMULA_LEADS) else value


def local(dt):
    """A naive Kenyan-time datetime for a cell, or None."""
    return timezone.localtime(dt, REPORT_TZ).replace(tzinfo=None) if dt else None


def duration_text(seconds):
    """3h 07m, or 2d 4h for anything a day or longer."""
    if seconds is None:
        return "—"
    minutes = int(seconds // 60)
    days, rem = divmod(minutes, 24 * 60)
    hours, mins = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h"
    return f"{hours}h {mins:02d}m"


def _facility_rows(qs, window):
    """Each facility with tickets in the window, and the trade it breaks for most."""
    by_pair = group(qs, window, ["facility", "trade"])
    top_trade = {}
    # Ties go to the trade first in the alphabet, so the same data always
    # names the same trade.
    for row in sorted(by_pair, key=lambda r: (-r["total"], r["label_2"] or "")):
        top_trade.setdefault(row["key"], (row["label_2"], row["total"]))
    rows = group(qs, window, ["facility"])
    # Every campus has an "Administration Block", so a row names its campus.
    campus_of = dict(
        Facility.objects.filter(pk__in=[r["key"] for r in rows]).values_list(
            "pk", "campus__name"
        )
    )
    for row in rows:
        row["top_trade"] = top_trade.get(row["key"], ("—", 0))[0]
        row["campus"] = campus_of.get(row["key"], "")
    return rows


def _ticket_rows(qs, window):
    """One row per ticket raised in the window, oldest first."""
    tickets = (
        measured(raised_in(qs, window))
        .select_related(
            "requester_campus", "trade", "service_item", "facility",
            "raised_by", "assigned_to", "priority",
        )
        .order_by("created_at")
    )
    rows = []
    for t in tickets:
        rows.append(
            {
                "ticket_no": t.ticket_no,
                "campus": t.requester_campus.name,
                "trade": t.trade.name,
                "service": t.service_item.name,
                "facility": t.facility.name,
                "where": t.location_detail,
                "raised_by": display_name(t.raised_by),
                "assigned_to": display_name(t.assigned_to) if t.assigned_to else "",
                "priority": t.priority.name,
                "status": STATUS_LABELS.get(t.status, t.status),
                "level": LEVEL_LABELS.get(t.current_level, t.current_level),
                "hold_reason": PENDING_REASON_LABELS.get(t.pending_reason, ""),
                "raised": local(t.created_at),
                "assigned": local(t.first_assigned_at),
                "resolved": local(t.resolved_at),
                "due": local(t.resolution_due_at),
                "sla": (sla_outcome(t) or "").capitalize(),
                "rating": t.rating,
                "rating_comment": t.rating_comment,
            }
        )
    return rows


def report_data(user, role, window):
    """Everything both formats print, for this caller and period."""
    qs = reporting_ticket_qs(user, role)
    by_status = {row["key"]: row["total"] for row in group(qs, window, ["status"])}
    return {
        "title": "Maintenance Helpdesk Report",
        "scope": scope_label(user, role),
        "role": role,
        "from": local(window["from"]),
        "to": local(window["to"]),
        "generated": local(timezone.now()),
        "totals": totals(qs, window),
        "by_status": {code: by_status.get(code, 0) for code, _ in STATUSES},
        "by_campus": group(qs, window, ["campus"]) if role in ("admin", "manager") else None,
        "by_trade": group(qs, window, ["trade"]),
        "by_technician": None if role == "technician" else group(qs, window, ["technician"]),
        "by_facility": _facility_rows(qs, window),
        "holds": bottlenecks(qs),
        "trend": trend(qs, window, window["bucket"]),
        "tickets": _ticket_rows(qs, window),
    }


def summary_rows(data):
    """The headline figures as (label, value, kind), kind naming the format.

    A technician's are about their own work: how many jobs, how fast, how many
    on time, and how they were rated. The rest are for whoever runs a section.
    """
    t = data["totals"]
    s = data["by_status"]
    if data["role"] == "technician":
        return [
            ("Jobs assigned to me", t["total"], "count"),
            ("Active now", t["open_backlog"], "count"),
            ("Overdue now", t["overdue"], "count"),
            ("Jobs finished", t["settled"], "count"),
            ("On time", t["resolution_sla_pct"], "pct"),
            ("Missed deadlines", t["missed"], "count"),
            ("Average time to fix", t["resolution_seconds_avg"], "duration"),
            ("Assigned", s["assigned"], "count"),
            ("In progress", s["in_progress"], "count"),
            ("On hold", s["pending"], "count"),
            ("Resolved", s["resolved"], "count"),
            ("Closed", s["closed"], "count"),
            ("Escalated, now with the HOS", t["escalated_hos"], "count"),
            ("Escalated, now with the HOD", t["escalated_hod"], "count"),
            ("Average rating (of 5)", t["rating_avg"], "number"),
            ("Ratings given", t["rating_count"], "count"),
        ]
    return [
        ("Tickets raised", t["total"], "count"),
        ("Open (not yet assigned)", s["open"], "count"),
        ("Assigned", s["assigned"], "count"),
        ("In progress", s["in_progress"], "count"),
        ("On hold", s["pending"], "count"),
        ("Resolved", s["resolved"], "count"),
        ("Closed", s["closed"], "count"),
        ("Completion rate", t["completion_pct"], "pct"),
        ("Open backlog (now)", t["open_backlog"], "count"),
        ("Overdue (now)", t["overdue"], "count"),
        ("Average response time", t["response_seconds_avg"], "duration"),
        ("Average resolution time", t["resolution_seconds_avg"], "duration"),
        ("Resolution SLA", t["resolution_sla_pct"], "pct"),
        ("Response SLA", t["response_sla_pct"], "pct"),
        ("Missed deadlines", t["missed"], "count"),
        ("Escalated, now with the HOS", t["escalated_hos"], "count"),
        ("Escalated, now with the HOD", t["escalated_hod"], "count"),
        ("Average rating (of 5)", t["rating_avg"], "number"),
        ("Ratings given", t["rating_count"], "count"),
        ("Closed tickets rated", t["rated_pct"], "pct"),
    ]


def filename(data, extension):
    """e.g. helpdesk-report-nairobi-campus-2026-09-15-to-2026-10-15.xlsx

    ASCII letters and digits only, so the name sits in a plain header.
    """
    slug = "".join(
        c if c.isascii() and c.isalnum() else "-" for c in data["scope"].lower()
    ).strip("-") or "report"
    while "--" in slug:
        slug = slug.replace("--", "-")
    return (
        f"helpdesk-report-{slug}-{data['from']:%Y-%m-%d}-to-{data['to']:%Y-%m-%d}.{extension}"
    )


# ─── Excel ──────────────────────────────────────────────────────────────────


def build_workbook(data) -> bytes:
    """The workbook: a summary sheet, one sheet per breakdown, and every ticket."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor=KSG_BROWN)
    pct_format = "0.0%"
    duration_format = "[h]:mm"
    date_format = "yyyy-mm-dd hh:mm"

    wb = Workbook()

    def append(ws, values):
        """Add a row, every text value made safe for a cell."""
        ws.append([cell_text(v) for v in values])

    def header(ws, headings):
        append(ws, headings)
        for cell in ws[ws.max_row]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(vertical="center")
        # An address, not `ws.cell(...)`: reading a cell creates the row.
        ws.freeze_panes = f"A{ws.max_row + 1}"

    def widths(ws, minimum=10, maximum=48):
        for column in ws.columns:
            longest = max((len(str(c.value)) for c in column if c.value is not None), default=0)
            ws.column_dimensions[get_column_letter(column[0].column)].width = max(
                minimum, min(maximum, longest + 2)
            )

    def put(cell, value, kind):
        if kind == "duration":
            cell.value = None if value is None else timedelta(seconds=value)
            cell.number_format = duration_format
        elif kind == "pct":
            # A fraction, so Excel's own percent arithmetic and formatting work.
            cell.value = None if value is None else value / 100
            cell.number_format = pct_format
        else:
            cell.value = value

    kinds = {
        "completion_pct": "pct", "resolution_sla_pct": "pct", "response_sla_pct": "pct",
        "response_seconds_avg": "duration", "resolution_seconds_avg": "duration",
    }

    # Summary
    ws = wb.active
    ws.title = "Summary"
    append(ws, [data["title"]])
    ws["A1"].font = Font(bold=True, size=14, color=KSG_BROWN_DEEP)
    append(ws, ["Covers", data["scope"]])
    append(ws, ["Period", f"{data['from']:%d %b %Y} to {data['to']:%d %b %Y}"])
    append(ws, ["Generated", data["generated"]])
    ws["B4"].number_format = date_format
    append(ws, ["Times are in Kenyan time (EAT)."])
    append(ws, [])
    header(ws, ["Figure", "Value"])
    for label, value, kind in summary_rows(data):
        append(ws, [label])
        put(ws.cell(row=ws.max_row, column=2), value, kind)
    append(ws, [])
    append(ws, ["Durations read hours:minutes. Response is raised to first assigned; "
               "resolution is raised to resolved, with time on hold left out."])
    widths(ws)

    def breakdown_sheet(title, rows, first_heading):
        sheet = wb.create_sheet(title)
        header(sheet, [first_heading] + [h for _, h in BREAKDOWN_COLUMNS])
        for row in rows:
            append(sheet, [row["label"]])
            r = sheet.max_row
            for i, (key, _) in enumerate(BREAKDOWN_COLUMNS, start=2):
                put(sheet.cell(row=r, column=i), row.get(key), kinds.get(key, "number"))
        widths(sheet)

    if data["by_campus"] is not None:
        breakdown_sheet("By campus", data["by_campus"], "Campus")
    breakdown_sheet("By trade", data["by_trade"], "Trade")
    if data["by_technician"] is not None:
        breakdown_sheet("By technician", data["by_technician"], "Technician")

    ws = wb.create_sheet("By facility")
    header(ws, ["Facility", "Campus", "Raised", "Open", "Escalated", "Most frequent trade"])
    for row in data["by_facility"]:
        append(ws, [
            row["label"], row["campus"], row["total"], row["open"], row["escalated"],
            row["top_trade"],
        ])
    widths(ws)

    ws = wb.create_sheet("Holds")
    header(ws, ["Reason", "On hold now", "Oldest hold since"])
    for row in data["holds"]:
        append(ws, [row["label"], row["total"], local(row["since"])])
        ws.cell(row=ws.max_row, column=3).number_format = date_format
    widths(ws)

    ws = wb.create_sheet("Tickets")
    columns = [
        ("ticket_no", "Ticket"), ("campus", "Campus"), ("trade", "Trade"),
        ("service", "Service"), ("facility", "Facility"), ("where", "Where"),
        ("raised_by", "Raised by"), ("assigned_to", "Assigned to"),
        ("priority", "Priority"), ("status", "Status"), ("level", "Escalation level"),
        ("hold_reason", "Hold reason"), ("raised", "Raised"), ("assigned", "First assigned"),
        ("resolved", "Resolved"), ("due", "Resolution due"), ("sla", "SLA"),
        ("rating", "Rating"), ("rating_comment", "Rating comment"),
    ]
    header(ws, [h for _, h in columns])
    dated = {"raised", "assigned", "resolved", "due"}
    for row in data["tickets"]:
        append(ws, [row[key] for key, _ in columns])
        for i, (key, _) in enumerate(columns, start=1):
            if key in dated:
                ws.cell(row=ws.max_row, column=i).number_format = date_format
    ws.auto_filter.ref = ws.dimensions
    widths(ws, minimum=12)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# ─── PDF ────────────────────────────────────────────────────────────────────


def _cell(value, kind):
    if value is None:
        return "—"
    if kind == "pct":
        return f"{value:.1f}%"
    if kind == "duration":
        return duration_text(value)
    if kind == "number":
        return f"{value:.2f}".rstrip("0").rstrip(".")
    return str(value)


def build_pdf(data) -> bytes:
    """A few pages to read or share: headline figures, three charts, the tables."""
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.charts.legends import Legend
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    styles = getSampleStyleSheet()
    body = styles["BodyText"]
    h1 = styles["Title"].clone("ksg-title", textColor=colors.HexColor(f"#{KSG_BROWN_DEEP}"))
    h2 = styles["Heading2"].clone("ksg-heading", textColor=colors.HexColor(f"#{KSG_BROWN_DEEP}"))
    small = styles["BodyText"].clone("small", fontSize=8, leading=10, textColor=colors.grey)
    cell_style = styles["BodyText"].clone("cell", fontSize=8, leading=9.5)
    brown = colors.HexColor(f"#{KSG_BROWN}")
    green_dark = colors.HexColor(f"#{KSG_GREEN_DARK}")
    palette = [colors.HexColor(c) for c in (
        "#2563EB", "#16A34A", "#F59E0B", "#DC2626", "#7C3AED", "#0891B2", "#DB2777", "#65A30D",
    )]
    page_width = A4[0] - 30 * mm

    def table(headings, rows, col_widths=None, text_columns=(0,)):
        """Numbers right-aligned; the columns named in `text_columns` left."""
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), brown),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FBF8EF")]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2D8BF")),
            ("ALIGN", (0, 1), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        style += [("ALIGN", (c, 1), (c, -1), "LEFT") for c in text_columns]
        # Names go in as paragraphs, so a long one wraps inside its column and
        # a "<" or "&" in it is text, not markup.
        rows = [
            [Paragraph(escape(str(v)), cell_style) if i in text_columns else v
             for i, v in enumerate(row)]
            for row in rows
        ]
        t = Table([headings] + rows, colWidths=col_widths, repeatRows=1)
        t.setStyle(TableStyle(style))
        return t

    def pie(items):
        items = [(label, value) for label, value in items if value]
        d = Drawing(page_width / 2, 62 * mm)
        if not items:
            return d
        p = Pie()
        p.x, p.y, p.width, p.height = 10, 20, 40 * mm, 40 * mm
        p.data = [v for _, v in items]
        p.labels = None
        for i in range(len(items)):
            p.slices[i].fillColor = palette[i % len(palette)]
            p.slices[i].strokeColor = colors.white
        d.add(p)
        legend = Legend()
        legend.x, legend.y = 50 * mm, 52 * mm
        legend.fontSize = 7
        legend.alignment = "right"
        # One column, so the legend stays inside its half of the page.
        legend.columnMaximum = len(items)
        legend.colorNamePairs = [
            (palette[i % len(palette)], f"{label} ({value})") for i, (label, value) in enumerate(items)
        ]
        d.add(legend)
        return d

    # A technician's report is about their own jobs, and says so in its own words.
    mine = data["role"] == "technician"
    finished = "Finished" if mine else "Settled"

    def bars(points):
        # Room under the axis for the slanted date labels, inside the drawing.
        d = Drawing(page_width, 62 * mm)
        if not points:
            return d
        chart = VerticalBarChart()
        chart.x, chart.y = 25, 12 * mm
        chart.width, chart.height = page_width - 40, 40 * mm
        chart.data = [[p["total"] for p in points], [p["settled"] for p in points]]
        chart.bars[0].fillColor = brown
        chart.bars[1].fillColor = green_dark
        chart.categoryAxis.categoryNames = [
            f"{timezone.localtime(p['bucket'], REPORT_TZ):%d %b}" for p in points
        ]
        chart.categoryAxis.labels.fontSize = 6
        chart.categoryAxis.labels.angle = 45 if len(points) > 12 else 0
        chart.categoryAxis.labels.boxAnchor = "ne" if len(points) > 12 else "n"
        chart.valueAxis.valueMin = 0
        chart.valueAxis.labels.fontSize = 7
        chart.valueAxis.valueStep = max(1, (max(chart.data[0]) // 5) or 1)
        d.add(chart)
        legend = Legend()
        legend.x, legend.y = page_width - 70, 62 * mm
        legend.fontSize = 7
        legend.colorNamePairs = [(brown, "Raised"), (green_dark, finished)]
        d.add(legend)
        return d

    def breakdown(title, rows, first_heading, limit=None):
        columns = [
            ("total", "Raised", "count"), ("open", "Open", "count"),
            ("completion_pct", "Done", "pct"),
        ] + ([] if mine else [("response_seconds_avg", "Avg resp.", "duration")]) + [
            ("resolution_seconds_avg", "Avg resol.", "duration"),
            ("resolution_sla_pct", "SLA", "pct"), ("escalated", "Escal.", "count"),
            ("rating_avg", "Rating", "number"),
        ]
        rows = rows[:limit] if limit else rows
        body_rows = [
            [row["label"]] + [_cell(row.get(key), kind) for key, _, kind in columns]
            for row in rows
        ]
        widths_ = [page_width * 0.28] + [page_width * 0.09] * len(columns)
        return KeepTogether([
            Paragraph(title, h2),
            table([first_heading] + [h for _, h, _ in columns], body_rows or [["No tickets"] + [""] * len(columns)], widths_),
            Spacer(1, 4 * mm),
        ])

    story = [
        Paragraph(data["title"], h1),
        Paragraph(f"<b>Covers:</b> {escape(data['scope'])}", body),
        Paragraph(
            f"<b>Period:</b> {data['from']:%d %b %Y} to {data['to']:%d %b %Y}"
            f" &nbsp;&nbsp; <b>Generated:</b> {data['generated']:%d %b %Y %H:%M} EAT",
            body,
        ),
        Spacer(1, 5 * mm),
        Paragraph("Headline figures", h2),
    ]

    figures = summary_rows(data)
    half = (len(figures) + 1) // 2
    pairs = []
    for left, right in zip(figures[:half], figures[half:] + [None]):
        pairs.append(
            [left[0], _cell(left[1], left[2])]
            + ([right[0], _cell(right[1], right[2])] if right else ["", ""])
        )
    headline = table(["Figure", "Value", "Figure", "Value"], pairs,
                     [page_width * 0.32, page_width * 0.18] * 2, text_columns=(0, 2))
    story += [headline, Spacer(1, 2 * mm), Paragraph(
        (
            "Counts are of your jobs raised in the period, except active and overdue, which "
            "are as of now. Time to fix leaves out time on hold. On time is the share of "
            "finished jobs done by their deadline."
            if mine else
            "Counts are of tickets raised in the period, except backlog and overdue, which are "
            "as of now. Resolution time leaves out time on hold. SLA is the share of settled "
            "tickets finished by their deadline."
        ), small), Spacer(1, 4 * mm)]
    # A trade with no jobs in the period is no slice, so this counts trades worked, not held.
    several_trades = not mine or len(data["by_trade"]) > 1

    # Where the work is, straight after how much of it there is.
    hotspots = [
        [row["label"], row["campus"], str(row["total"]), str(row["open"]),
         str(row["escalated"]), row["top_trade"]]
        for row in data["by_facility"][:10]
    ]
    story.append(KeepTogether([
        Paragraph("Where your jobs were (top 10)" if mine else "Facility hotspots (top 10)", h2),
        table(["Facility", "Campus", "Raised", "Open", "Escalated", "Most frequent trade"],
              hotspots or [["No tickets", "", "", "", "", ""]],
              [page_width * w for w in (0.28, 0.16, 0.1, 0.1, 0.12, 0.24)],
              text_columns=(0, 1, 5)),
    ]))

    story += [
        Spacer(1, 4 * mm),
        KeepTogether([
            Paragraph("Jobs raised and finished" if mine else "Tickets raised and settled", h2),
            bars(data["trend"]),
        ]),
        Spacer(1, 4 * mm),
    ]
    status_items = [(STATUS_LABELS[code], n) for code, n in data["by_status"].items()]
    trade_items = [(row["label"], row["total"]) for row in data["by_trade"]]
    if several_trades:
        pies = Table([[Paragraph("Where my jobs stand" if mine else "Status", body),
                       Paragraph("Trade", body)],
                      [pie(status_items), pie(trade_items)]],
                     colWidths=[page_width / 2] * 2)
    else:
        pies = Table([[Paragraph("Where my jobs stand", body)], [pie(status_items)]],
                     colWidths=[page_width])
    story += [KeepTogether([pies]), Spacer(1, 4 * mm)]

    if data["by_campus"] is not None:
        story.append(breakdown("Campus comparison", data["by_campus"], "Campus"))
    if several_trades:
        story.append(breakdown("Trade performance", data["by_trade"], "Trade"))
    if data["by_technician"] is not None:
        story.append(breakdown("Technician performance", data["by_technician"], "Technician"))

    holds = [
        [row["label"], str(row["total"]), f"{local(row['since']):%d %b %Y}" if row["since"] else "—"]
        for row in data["holds"]
    ]
    story.append(KeepTogether([
        Paragraph("On hold now, by reason", h2),
        table(["Reason", "Tickets", "Oldest hold since"], holds or [["Nothing is on hold", "", ""]],
              [page_width * 0.6, page_width * 0.15, page_width * 0.25]),
    ]))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.grey)
        canvas.drawString(15 * mm, 10 * mm, f"{data['title']} · {data['scope']}")
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=15 * mm, bottomMargin=18 * mm,
        title=data["title"], author="Resolver", subject=data["scope"],
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
