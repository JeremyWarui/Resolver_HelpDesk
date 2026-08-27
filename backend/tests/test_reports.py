"""The Excel export — it builds, it respects scope, and it agrees with the screen.

Nothing here checks formatting. A report that quietly exports another campus's
tickets looks identical to a working one from the outside.
"""

from io import BytesIO

import openpyxl
import pytest
from django.urls import reverse

from apps.tickets.lifecycle import transition_status

pytestmark = pytest.mark.django_db


def _workbook(response):
    assert response.status_code == 200, response.content[:400]
    assert response["Content-Type"].startswith(
        "application/vnd.openxmlformats-officedocument"
    )
    return openpyxl.load_workbook(BytesIO(response.content))


def _generate(api):
    return api.get(reverse("analytics:report-generate"))


@pytest.fixture
def worked_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos):
    """One ticket carried through to resolved, so the sheets have real rows:
    a resolution time to average, a pause to report, a rating to summarise."""
    t = nrb_electrical_ticket
    t.assigned_to = nrb_electrician
    t.save(update_fields=["assigned_to"])
    transition_status(t, "assigned", nrb_hos)
    transition_status(t, "in_progress", nrb_electrician)
    transition_status(
        t, "pending", nrb_electrician, pending_reason="material_not_in_store"
    )
    transition_status(t, "in_progress", nrb_electrician)
    transition_status(t, "resolved", nrb_electrician)
    return t


def test_the_export_builds_a_workbook(api, nrb_hos, worked_ticket):
    api.force_authenticate(nrb_hos)
    wb = _workbook(_generate(api))
    assert wb.sheetnames == ["Summary", "Tickets"]


def test_the_tickets_sheet_lists_the_ticket(api, nrb_hos, worked_ticket):
    api.force_authenticate(nrb_hos)
    ws = _workbook(_generate(api))["Tickets"]
    values = {str(c.value) for row in ws.iter_rows() for c in row}
    assert worked_ticket.ticket_no in values


def test_an_export_never_carries_another_campus(
    api,
    msa_hos,
    worked_ticket,
    msa_electrical_ticket,
):
    """The negative that makes the rest worth having. An HOS at Mombasa exports
    their own section; the Nairobi ticket must be absent, not merely unlabelled."""
    api.force_authenticate(msa_hos)
    ws = _workbook(_generate(api))["Tickets"]
    values = {str(c.value) for row in ws.iter_rows() for c in row}
    assert msa_electrical_ticket.ticket_no in values
    assert worked_ticket.ticket_no not in values


def test_the_summary_sheet_agrees_with_the_analytics_endpoint(
    api,
    nrb_hos,
    worked_ticket,
    nrb_plumbing_ticket,
):
    """The Summary is `aggregate()` over the same scope and window as the
    dashboard. If the two ever compute their own answer, this is what notices."""
    api.force_authenticate(nrb_hos)
    summary = _workbook(_generate(api))["Summary"]
    cells = {
        str(row[0]).strip().lower(): row[1]
        for row in summary.iter_rows(values_only=True)
        if row and row[0] is not None and len(row) > 1
    }

    headline = api.get(reverse("analytics:analytics")).json()["headline"]
    assert cells["open backlog"] == headline["open_backlog"]
    assert cells["tickets raised"] == headline["created"]
    assert cells["tickets resolved"] == headline["resolved"]
    assert cells["overdue now"] == headline["breached"]
