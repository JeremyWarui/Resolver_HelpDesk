"""The manager oversees the estate; the manager does not work tickets.

A manager's scope is every campus, so every 403 below is a role refusal, not a
scope refusal — they are fully in scope for these tickets.
"""

import pytest
from django.urls import reverse


pytestmark = pytest.mark.django_db


def test_a_manager_can_read_the_ticket_they_may_not_touch(
    api,
    manager,
    nrb_electrical_ticket,
):
    """The control for every 403 below: in scope, and still refused."""
    api.force_authenticate(manager)
    response = api.get(reverse("ticket-detail", args=[nrb_electrical_ticket.pk]))
    assert response.status_code == 200


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


def test_a_manager_cannot_delete_someone_elses_attachment(
    api,
    manager,
    requester,
    nrb_electrical_ticket,
    settings,
    tmp_path,
):
    """Deleting another person's evidence is a supervisor action, not oversight."""
    settings.MEDIA_ROOT = str(tmp_path)
    from tests.test_attachments import an_image

    api.force_authenticate(requester)
    upload = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": an_image()},
        format="multipart",
    )
    assert upload.status_code == 201
    (row,) = upload.data

    api.force_authenticate(manager)
    response = api.delete(
        reverse("ticket-attachment-detail", args=[nrb_electrical_ticket.pk, row["id"]])
    )
    assert response.status_code == 403
    assert nrb_electrical_ticket.attachments.count() == 1


def test_a_manager_reads_the_reporting_for_every_campus(
    api,
    manager,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    """Reporting is the manager's whole reason to log in, and it is gated by
    scope alone — there is no role list to fall off."""
    api.force_authenticate(manager)
    body = api.get(reverse("analytics:analytics"))

    assert body.status_code == 200
    assert body.data["headline"]["open_backlog"] == 2
