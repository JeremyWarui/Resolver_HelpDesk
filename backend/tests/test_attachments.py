"""The attachment endpoint, which the ticket wizard posts to after creating.

The upload UI shipped as a mock — a timer filled a progress bar and no request
was ever made — so nothing here was exercised end to end. These tests pin the
contract the wizard now relies on: the field name, the limits, and who may
delete.
"""

import io

import pytest
from django.urls import reverse

from apps.tickets.models import TicketAttachment
from apps.tickets.services.attachments import MAX_ATTACHMENTS_PER_TICKET


def an_image(name="photo.jpg", size=(60, 40), fmt="JPEG"):
    """A real encoded image — process_upload opens it with Pillow."""
    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, (120, 30, 30)).save(buf, format=fmt)
    mime = "image/jpeg" if fmt == "JPEG" else f"image/{fmt.lower()}"
    return SimpleUploadedFile(name, buf.getvalue(), content_type=mime)


@pytest.fixture
def media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


@pytest.mark.django_db
def test_the_wizard_field_name_uploads_and_compresses(
    api, requester, nrb_electrical_ticket, media
):
    """`files` is what uploadAttachments() sends. A JPEG round-trips smaller."""
    api.force_authenticate(requester)
    url = reverse("ticket-attachments", args=[nrb_electrical_ticket.pk])

    resp = api.post(url, {"files": an_image()}, format="multipart")

    assert resp.status_code == 201
    (row,) = resp.data
    assert row["original_name"] == "photo.jpg"
    assert row["mime_type"] == "image/jpeg"
    assert row["url"]
    assert row["stored_size"] > 0
    assert nrb_electrical_ticket.attachments.count() == 1


@pytest.mark.django_db
def test_several_files_arrive_in_one_request(
    api, requester, nrb_electrical_ticket, media
):
    """The wizard sends the whole batch at once, not one request per file."""
    api.force_authenticate(requester)
    resp = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": [an_image("a.jpg"), an_image("b.jpg")]},
        format="multipart",
    )
    assert resp.status_code == 201
    assert len(resp.data) == 2


@pytest.mark.django_db
def test_the_per_ticket_cap_is_enforced_across_requests(
    api, requester, nrb_electrical_ticket, media
):
    """The uploader caps at 5 client-side; the server must not trust that."""
    api.force_authenticate(requester)
    url = reverse("ticket-attachments", args=[nrb_electrical_ticket.pk])

    for i in range(MAX_ATTACHMENTS_PER_TICKET):
        assert api.post(url, {"files": an_image(f"{i}.jpg")}, format="multipart").status_code == 201

    over = api.post(url, {"files": an_image("last.jpg")}, format="multipart")
    assert over.status_code == 400
    assert "Maximum" in over.data["detail"]
    assert nrb_electrical_ticket.attachments.count() == MAX_ATTACHMENTS_PER_TICKET


@pytest.mark.django_db
def test_a_batch_that_would_overflow_the_cap_is_refused_whole(
    api, requester, nrb_electrical_ticket, media
):
    api.force_authenticate(requester)
    url = reverse("ticket-attachments", args=[nrb_electrical_ticket.pk])
    api.post(url, {"files": [an_image("a.jpg"), an_image("b.jpg")]}, format="multipart")

    resp = api.post(
        url,
        {"files": [an_image(f"{i}.jpg") for i in range(4)]},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "slot" in resp.data["detail"]
    assert nrb_electrical_ticket.attachments.count() == 2


@pytest.mark.django_db
def test_an_executable_is_rejected_on_content_type(
    api, requester, nrb_electrical_ticket, media
):
    from django.core.files.uploadedfile import SimpleUploadedFile

    api.force_authenticate(requester)
    resp = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": SimpleUploadedFile("x.sh", b"#!/bin/sh\nrm -rf /", content_type="application/x-sh")},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "not permitted" in resp.data["detail"]
    assert not TicketAttachment.objects.exists()


@pytest.mark.django_db
def test_posting_no_file_says_which_field_to_use(
    api, requester, nrb_electrical_ticket, media
):
    api.force_authenticate(requester)
    resp = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]), {}, format="multipart"
    )
    assert resp.status_code == 400
    assert "files" in resp.data["detail"]


@pytest.mark.django_db
def test_a_requester_cannot_delete_someone_elses_attachment(
    api, requester, nrb_hos, nrb_electrical_ticket, media
):
    """Deletion is uploader-or-supervisor. The requester raised the ticket but
    did not upload this file."""
    api.force_authenticate(nrb_hos)
    created = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": an_image()},
        format="multipart",
    ).data[0]

    url = reverse("ticket-attachment-detail", args=[nrb_electrical_ticket.pk, created["id"]])

    api.force_authenticate(requester)
    assert api.delete(url).status_code == 403
    assert TicketAttachment.objects.filter(pk=created["id"]).exists()

    api.force_authenticate(nrb_hos)
    assert api.delete(url).status_code == 204
    assert not TicketAttachment.objects.filter(pk=created["id"]).exists()
