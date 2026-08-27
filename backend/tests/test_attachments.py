"""The attachment endpoint, which the ticket wizard posts to after creating.

These pin the contract the wizard relies on: the field name, the limits, and
who may delete.
"""

import io

import pytest
from django.urls import reverse

from apps.tickets.models import TicketAttachment
from apps.tickets.attachments import MAX_ATTACHMENTS_PER_TICKET


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
    api,
    requester,
    nrb_electrical_ticket,
    media,
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
def test_the_per_ticket_cap_is_enforced_across_requests(
    api,
    requester,
    nrb_electrical_ticket,
    media,
):
    """The uploader caps at 5 client-side; the server must not trust that."""
    api.force_authenticate(requester)
    url = reverse("ticket-attachments", args=[nrb_electrical_ticket.pk])

    for i in range(MAX_ATTACHMENTS_PER_TICKET):
        assert (
            api.post(
                url, {"files": an_image(f"{i}.jpg")}, format="multipart"
            ).status_code
            == 201
        )

    over = api.post(url, {"files": an_image("last.jpg")}, format="multipart")
    assert over.status_code == 400
    assert "Maximum" in over.data["detail"]
    assert nrb_electrical_ticket.attachments.count() == MAX_ATTACHMENTS_PER_TICKET


@pytest.mark.django_db
@pytest.mark.parametrize(
    "name,payload,mime",
    [
        ("photo.jpg", None, "image/jpeg"),
        ("photo.png", None, "image/png"),
        ("manual.pdf", b"%PDF-1.4 fake", "application/pdf"),
        (
            "form.docx",
            b"PK fake",
            "application/vnd.openxmlformats-officedocument"
            ".wordprocessingml.document",
        ),
    ],
)
def test_the_five_permitted_types_are_accepted(
    api,
    requester,
    nrb_electrical_ticket,
    media,
    name,
    payload,
    mime,
):
    """JPEG, JPG, PNG, PDF and DOCX — JPG and JPEG share one media type."""
    from django.core.files.uploadedfile import SimpleUploadedFile

    api.force_authenticate(requester)
    upload = (
        an_image(name, fmt="PNG" if name.endswith(".png") else "JPEG")
        if payload is None
        else SimpleUploadedFile(name, payload, content_type=mime)
    )
    resp = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": upload},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data


@pytest.mark.django_db
@pytest.mark.parametrize(
    "name,mime",
    [
        ("animation.gif", "image/gif"),
        ("photo.webp", "image/webp"),
        ("sheet.xlsx", "application/vnd.openxmlformats-officedocument"
                       ".spreadsheetml.sheet"),
        ("old.doc", "application/msword"),
        ("book.xls", "application/vnd.ms-excel"),
    ],
)
def test_every_other_type_is_refused(
    api,
    requester,
    nrb_electrical_ticket,
    media,
    name,
    mime,
):
    """The allow-list is the five the spec names. Everything else, including
    the other office and image formats, is a 400.
    """
    from django.core.files.uploadedfile import SimpleUploadedFile

    api.force_authenticate(requester)
    resp = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": SimpleUploadedFile(name, b"payload", content_type=mime)},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "not permitted" in resp.data["detail"]
    assert not TicketAttachment.objects.exists()


@pytest.mark.django_db
def test_a_requester_cannot_delete_someone_elses_attachment(
    api,
    requester,
    nrb_hos,
    nrb_electrical_ticket,
    media,
):
    """Deletion is uploader-or-supervisor. The requester raised the ticket but
    did not upload this file."""
    api.force_authenticate(nrb_hos)
    created = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": an_image()},
        format="multipart",
    ).data[0]

    url = reverse(
        "ticket-attachment-detail", args=[nrb_electrical_ticket.pk, created["id"]]
    )

    api.force_authenticate(requester)
    assert api.delete(url).status_code == 403
    assert TicketAttachment.objects.filter(pk=created["id"]).exists()

    api.force_authenticate(nrb_hos)
    assert api.delete(url).status_code == 204
    assert not TicketAttachment.objects.filter(pk=created["id"]).exists()
