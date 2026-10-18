"""The manager reads the whole organisation and opens no ticket.

The ticket list, the figures and the ratings cover every campus. Opening or
acting on a ticket is refused, except one the manager raised themselves.
"""

import pytest
from django.urls import reverse

from tests import factories

pytestmark = pytest.mark.django_db


def test_a_manager_reads_the_reporting_for_every_campus(
    api,
    manager,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    api.force_authenticate(manager)
    body = api.get(reverse("analytics:analytics"))

    assert body.status_code == 200
    assert body.data["totals"]["open_backlog"] == 2


@pytest.mark.parametrize("dimension", ["campus", "trade", "facility", "technician"])
def test_a_manager_may_break_the_figures_down_by(
    api,
    manager,
    nrb_electrical_ticket,
    msa_electrical_ticket,
    nrb_electrician,
    msa_electrician,
    dimension,
):
    for ticket, tech in (
        (nrb_electrical_ticket, nrb_electrician),
        (msa_electrical_ticket, msa_electrician),
    ):
        ticket.assigned_to = tech
        ticket.status = "assigned"
        ticket.save(update_fields=["assigned_to", "status"])

    api.force_authenticate(manager)
    body = api.get(reverse("analytics:analytics"), {"group_by": dimension}).data

    assert body["scope"]["group_by"] == [dimension]
    assert sum(row["total"] for row in body["breakdown"]) == 2


def test_a_manager_breakdown_by_campus_carries_response_and_resolution_times(
    api, manager, nrb_electrical_ticket, msa_electrical_ticket
):
    api.force_authenticate(manager)
    rows = api.get(reverse("analytics:analytics"), {"group_by": "campus"}).data[
        "breakdown"
    ]

    assert len(rows) == 2
    for row in rows:
        assert "response_seconds_avg" in row
        assert "resolution_seconds_avg" in row
        assert "resolution_sla_pct" in row


def test_a_manager_lists_every_campuses_tickets(
    api, manager, nrb_electrical_ticket, msa_electrical_ticket
):
    api.force_authenticate(manager)
    rows = api.get(reverse("ticket-list")).json()["results"]
    assert {r["id"] for r in rows} == {nrb_electrical_ticket.pk, msa_electrical_ticket.pk}


def test_a_manager_cannot_open_a_ticket(api, manager, nrb_electrical_ticket):
    api.force_authenticate(manager)
    pk = nrb_electrical_ticket.pk
    for name in ("ticket-detail", "ticket-logs", "ticket-comments", "ticket-attachments"):
        assert api.get(reverse(name, args=[pk])).status_code == 403, name


def test_a_manager_reads_every_campuses_ratings_and_filter_options(
    api, manager, nrb_electrical_ticket, msa_electrical_ticket
):
    factories.rate_ticket(nrb_electrical_ticket, 4)
    factories.rate_ticket(msa_electrical_ticket, 2)
    api.force_authenticate(manager)

    rows = api.get(reverse("ticket-feedback-list")).json()["results"]
    assert {r["ticket_no"] for r in rows} == {
        nrb_electrical_ticket.ticket_no,
        msa_electrical_ticket.ticket_no,
    }
    options = api.get(reverse("ticket-filter-options")).json()
    assert len(options["requesters"]) == 2


def test_a_manager_reads_the_campus_registers_but_cannot_change_them(
    api, manager, nrb
):
    api.force_authenticate(manager)
    assert api.get(reverse("campus-list")).status_code == 200
    assert api.get(reverse("campus-roster")).status_code == 200
    assert api.post(
        reverse("campus-list"), {"name": "New", "code": "NEW"}, format="json"
    ).status_code == 403
    assert api.patch(
        reverse("campus-detail", args=[nrb.pk]), {"name": "X"}, format="json"
    ).status_code == 403


@pytest.mark.parametrize("role", ["nrb_hos", "nrb_electrician", "requester"])
def test_only_the_admin_and_manager_read_the_campus_registers(api, request, role):
    api.force_authenticate(request.getfixturevalue(role))
    assert api.get(reverse("campus-list")).status_code == 403
    assert api.get(reverse("campus-roster")).status_code == 403


def test_a_manager_cannot_change_a_ticket_status(
    api,
    manager,
    nrb_electrical_ticket,
    nrb_electrician,
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "assigned"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])

    api.force_authenticate(manager)
    response = api.post(
        reverse("ticket-status", args=[nrb_electrical_ticket.pk]),
        {"status": "in_progress"},
        format="json",
    )
    assert response.status_code == 403
    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.status == "assigned"


def test_a_manager_cannot_assign_a_ticket(
    api,
    manager,
    nrb_electrical_ticket,
    nrb_electrician,
):
    api.force_authenticate(manager)
    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )
    assert response.status_code == 403
    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.assigned_to_id is None


def test_a_manager_cannot_claim_a_ticket(api, manager, nrb_electrical_ticket):
    api.force_authenticate(manager)
    response = api.post(reverse("ticket-claim", args=[nrb_electrical_ticket.pk]))
    assert response.status_code == 403


def test_a_manager_cannot_upload_to_someone_elses_ticket(
    api,
    manager,
    nrb_electrical_ticket,
    settings,
    tmp_path,
):
    settings.MEDIA_ROOT = str(tmp_path)
    from tests.test_attachments import an_image

    api.force_authenticate(manager)
    response = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": an_image()},
        format="multipart",
    )

    assert response.status_code == 403
    assert nrb_electrical_ticket.attachments.count() == 0


def test_a_manager_still_reads_a_ticket_they_raised(
    api, manager, nrb, electrical, priorities
):
    """Everyone can raise a ticket, the manager included, and see their own."""
    own = factories.make_ticket(manager, nrb, electrical)
    api.force_authenticate(manager)

    assert api.get(reverse("ticket-detail", args=[own.pk])).status_code == 200
    rows = api.get(reverse("ticket-list"), {"mine": "1"}).json()["results"]
    assert [r["id"] for r in rows] == [own.pk]
