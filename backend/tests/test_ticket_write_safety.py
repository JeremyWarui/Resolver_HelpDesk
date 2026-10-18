"""Every ticket write runs under the row lock, and lands whole or not at all.

The lock itself only bites on PostgreSQL (the suite runs on SQLite, which has
no FOR UPDATE), so what is pinned here is that each write path asks for it.
"""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models.query import QuerySet
from django.urls import reverse

from apps.tickets.lifecycle import assign_ticket, transition_status
from apps.tickets.models import Ticket, TicketAttachment, TicketComment, TicketLog
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def locks(monkeypatch):
    """The `of=` argument of every select_for_update() made while it is active."""
    calls = []
    original = QuerySet.select_for_update

    def spy(self, *args, **kwargs):
        calls.append(kwargs.get("of"))
        return original(self, *args, **kwargs)

    monkeypatch.setattr(QuerySet, "select_for_update", spy)
    return calls


@pytest.fixture
def assigned_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos):
    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    return nrb_electrical_ticket


@pytest.fixture
def media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


def _image(name="photo.jpg"):
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (10, 120, 30)).save(buf, format="JPEG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")


def test_a_status_change_locks_the_row(api, assigned_ticket, nrb_electrician, locks):
    api.force_authenticate(nrb_electrician)
    response = api.post(
        reverse("ticket-status", args=[assigned_ticket.pk]),
        {"status": "in_progress"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    assert locks == [("self",)]


def test_an_assignment_locks_the_row(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, locks
):
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )

    assert response.status_code == 200, response.json()
    assert locks == [("self",)]


def test_a_claim_locks_the_row(api, nrb_electrician, nrb_electrical_ticket, locks):
    api.force_authenticate(nrb_electrician)
    response = api.post(reverse("ticket-claim", args=[nrb_electrical_ticket.pk]))

    assert response.status_code == 200, response.json()
    assert locks == [("self",)]


def test_a_comment_locks_the_row(api, assigned_ticket, nrb_electrician, locks):
    api.force_authenticate(nrb_electrician)
    response = api.post(
        reverse("ticket-comments", args=[assigned_ticket.pk]),
        {"body": "Breaker replaced."},
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert locks == [("self",)]


def test_an_upload_locks_the_row(api, nrb_hos, nrb_electrical_ticket, media, locks):
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": _image()},
        format="multipart",
    )

    assert response.status_code == 201, response.json()
    assert locks == [("self",)]


def test_a_status_change_is_undone_when_its_log_row_fails(
    assigned_ticket, nrb_electrician, monkeypatch
):
    """The ticket and its history move together, or neither moves."""

    def broken(*args, **kwargs):
        raise RuntimeError("log write failed")

    monkeypatch.setattr(TicketLog.objects, "create", broken)

    with pytest.raises(RuntimeError):
        transition_status(assigned_ticket, "in_progress", nrb_electrician)

    assert Ticket.objects.get(pk=assigned_ticket.pk).status == "assigned"


def test_an_assignment_is_undone_when_its_log_row_fails(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, monkeypatch
):
    def broken(*args, **kwargs):
        raise RuntimeError("log write failed")

    monkeypatch.setattr(TicketLog.objects, "create", broken)

    with pytest.raises(RuntimeError):
        assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)

    stored = Ticket.objects.get(pk=nrb_electrical_ticket.pk)
    assert stored.assigned_to_id is None
    assert stored.status == "open"


def test_a_comment_is_undone_when_its_log_row_fails(
    api, assigned_ticket, nrb_electrician, monkeypatch
):
    def broken(*args, **kwargs):
        raise RuntimeError("log write failed")

    monkeypatch.setattr(TicketLog.objects, "create", broken)
    api.force_authenticate(nrb_electrician)

    with pytest.raises(RuntimeError):
        api.post(
            reverse("ticket-comments", args=[assigned_ticket.pk]),
            {"body": "Breaker replaced."},
            format="json",
        )

    assert not TicketComment.objects.filter(ticket=assigned_ticket).exists()


def test_a_new_ticket_is_undone_when_its_log_row_fails(
    api, requester, nrb, electrical, facility_types, priorities, monkeypatch
):
    from apps.facilities.models import Facility

    block = Facility.objects.create(
        campus=nrb, facility_type=facility_types["office_block"], name="Admin Block"
    )
    item = factories.make_service_item(electrical)

    def broken(*args, **kwargs):
        raise RuntimeError("log write failed")

    monkeypatch.setattr(TicketLog.objects, "create", broken)
    api.force_authenticate(requester)

    with pytest.raises(RuntimeError):
        api.post(
            reverse("ticket-list"),
            {
                "service_item": item.pk,
                "description": "no power",
                "location": {"facility": block.pk, "detail": "Room 204"},
            },
            format="json",
        )

    assert not Ticket.objects.exists()


def test_an_upload_with_one_bad_file_stores_none_of_them(
    api, nrb_hos, nrb_electrical_ticket, media
):
    """Before, the good file was stored and a retry of the pair stored it twice."""
    bad = SimpleUploadedFile("notes.txt", b"plain text", content_type="text/plain")
    api.force_authenticate(nrb_hos)

    response = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": [_image(), bad]},
        format="multipart",
    )

    assert response.status_code == 400
    assert not TicketAttachment.objects.exists()


def test_a_bad_status_body_on_a_ticket_out_of_scope_is_still_a_403(
    api, msa_hos, nrb_electrical_ticket
):
    """Scope is checked first, as on every ticket route, whatever the body says."""
    api.force_authenticate(msa_hos)
    response = api.post(
        reverse("ticket-status", args=[nrb_electrical_ticket.pk]),
        {"status": "not-a-status"},
        format="json",
    )

    assert response.status_code == 403


def test_an_upload_that_fails_part_way_leaves_no_file_behind(
    api, nrb_hos, nrb_electrical_ticket, media, monkeypatch
):
    calls = {"n": 0}
    original = TicketAttachment.save

    def second_save_fails(self, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("disk full")
        return original(self, *args, **kwargs)

    monkeypatch.setattr(TicketAttachment, "save", second_save_fails)
    api.force_authenticate(nrb_hos)

    with pytest.raises(RuntimeError):
        api.post(
            reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
            {"files": [_image("a.jpg"), _image("b.jpg")]},
            format="multipart",
        )

    assert not TicketAttachment.objects.exists()
    assert [p for p in media.rglob("*") if p.is_file()] == []
