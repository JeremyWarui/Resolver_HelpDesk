"""The Excel export — it builds, it respects scope, and it agrees with the screen.

Nothing here checks formatting. A report that quietly exports another campus's
tickets looks identical to a working one from the outside.
"""

from io import BytesIO

import openpyxl
import pytest
from django.urls import reverse

from apps.tickets.lifecycle import claim_ticket, transition_status

pytestmark = pytest.mark.django_db


def _workbook(response):
    assert response.status_code == 200, response.content[:400]
    assert response["Content-Type"].startswith(
        "application/vnd.openxmlformats-officedocument"
    )
    return openpyxl.load_workbook(BytesIO(response.content))


def _generate(api, **params):
    return api.get(reverse("analytics:report-generate"), params)


def _cells(sheet):
    """The Summary sheet as {first column: second column}, lowercased."""
    return {
        str(row[0]).strip().lower(): row[1]
        for row in sheet.iter_rows(values_only=True)
        if row and row[0] is not None and len(row) > 1
    }


@pytest.fixture
def blocked_ticket(nrb_plumbing_ticket, nrb_plumber):
    """One ticket left on hold, because "On hold now" is a snapshot: a ticket
    whose hold was lifted leaves no trace, so the section needs a live one."""
    claim_ticket(nrb_plumbing_ticket, nrb_plumber)
    transition_status(
        nrb_plumbing_ticket,
        "pending",
        nrb_plumber,
        pending_reason="awaiting_material_requested",
    )
    return nrb_plumbing_ticket


@pytest.fixture
def worked_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos):
    """One ticket carried through to resolved, so the sheets have real rows: a
    resolution time to average, a hold to report, a rating to summarise."""
    ticket = nrb_electrical_ticket
    claim_ticket(ticket, nrb_electrician)
    transition_status(
        ticket, "pending", nrb_electrician, pending_reason="material_not_in_store"
    )
    transition_status(ticket, "in_progress", nrb_electrician)
    transition_status(ticket, "resolved", nrb_electrician)
    return ticket


def test_the_export_builds_a_workbook(api, nrb_hos, worked_ticket):
    api.force_authenticate(nrb_hos)
    assert _workbook(_generate(api)).sheetnames == ["Summary", "Tickets"]


def test_the_tickets_sheet_lists_the_ticket(api, nrb_hos, worked_ticket):
    api.force_authenticate(nrb_hos)
    sheet = _workbook(_generate(api))["Tickets"]
    values = {str(c.value) for row in sheet.iter_rows() for c in row}
    assert worked_ticket.ticket_no in values


def test_an_export_never_carries_another_campus(
    api, msa_hos, worked_ticket, msa_electrical_ticket
):
    """The negative that makes the rest worth having. An HOS at Mombasa exports
    their own campus; the Nairobi ticket must be absent, not merely unlabelled."""
    api.force_authenticate(msa_hos)
    sheet = _workbook(_generate(api))["Tickets"]
    values = {str(c.value) for row in sheet.iter_rows() for c in row}
    assert msa_electrical_ticket.ticket_no in values
    assert worked_ticket.ticket_no not in values


def test_the_summary_agrees_with_the_analytics_endpoint(
    api, nrb_hos, worked_ticket, nrb_plumbing_ticket
):
    """The Summary is the same `metrics` calls the dashboard makes, over the
    same scope and window. If the two ever compute their own answer, this is
    what notices."""
    api.force_authenticate(nrb_hos)
    cells = _cells(_workbook(_generate(api))["Summary"])
    figures = api.get(reverse("analytics:analytics")).json()["totals"]

    assert cells["open backlog"] == figures["open_backlog"]
    assert cells["tickets raised"] == figures["total"]
    assert cells["tickets settled"] == figures["settled"]
    assert cells["overdue now"] == figures["overdue"]


def test_the_summary_carries_every_reported_cut(
    api, nrb_hos, worked_ticket, blocked_ticket
):
    """Status, trade, technician, facility health and what is on hold — the cuts
    §8 asks a report to carry. Each is one `metrics` call, so a missing section
    is one that stopped being written rather than one that came back empty."""
    api.force_authenticate(nrb_hos)
    sheet = _workbook(_generate(api))["Summary"]
    titles = {str(row[0]).strip() for row in sheet.iter_rows(values_only=True) if row}
    cells = _cells(sheet)

    assert {
        "Tickets by status",
        "Tickets by trade",
        "Tickets by technician",
        "Facility health (facility by trade)",
        "On hold now",
    } <= titles
    assert cells[worked_ticket.trade.name.lower()] == 1
    assert cells["awaiting material — request placed"] == 1


def test_the_report_is_the_record_a_lifted_hold_does_not_leave(
    api, nrb_hos, worked_ticket
):
    """`worked_ticket` was held and then resumed. Nothing in the database
    remembers that, which is the whole point of running the report at the end of
    a period: the workbook is where a snapshot becomes a record."""
    api.force_authenticate(nrb_hos)
    rows = [
        row
        for row in _workbook(_generate(api))["Summary"].iter_rows(values_only=True)
        if row and row[0]
    ]
    on_hold = next(i for i, row in enumerate(rows) if row[0] == "On hold now")
    assert rows[on_hold + 1 :] == []


def test_the_facility_health_section_names_the_trade(api, nrb_hos, worked_ticket):
    api.force_authenticate(nrb_hos)
    sheet = _workbook(_generate(api))["Summary"]
    rows = [row for row in sheet.iter_rows(values_only=True) if row and row[0]]
    health = next(
        i for i, row in enumerate(rows) if row[0] == "Facility health (facility by trade)"
    )
    facility, trade, count = rows[health + 1][:3]
    assert facility == worked_ticket.facility.name
    assert trade == worked_ticket.trade.name
    assert count == 1


def test_a_technician_filter_narrows_and_never_widens(
    api, msa_hos, worked_ticket, msa_electrical_ticket, nrb_electrician
):
    """`technician_id` applies after scoping, so asking for a technician at
    another campus returns nothing rather than reaching past the caller."""
    api.force_authenticate(msa_hos)
    sheet = _workbook(_generate(api, technician_id=nrb_electrician.pk))["Tickets"]
    values = {str(c.value) for row in sheet.iter_rows() for c in row}
    assert worked_ticket.ticket_no not in values
    assert msa_electrical_ticket.ticket_no not in values


def test_a_nonsense_technician_filter_is_ignored_not_raised(
    api, nrb_hos, worked_ticket
):
    api.force_authenticate(nrb_hos)
    sheet = _workbook(_generate(api, technician_id="not-a-number"))["Tickets"]
    values = {str(c.value) for row in sheet.iter_rows() for c in row}
    assert worked_ticket.ticket_no in values
