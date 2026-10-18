"""Two writers at once, on a real PostgreSQL.

SQLite has no row locks, so these skip on the default suite. Run them with

    pytest tests/test_concurrency_postgres.py --ds=resolver.test_settings_postgres

Each test either holds a row (or a unique slot) and waits until PostgreSQL
reports the second writer blocked on it, or starts two writers at one barrier;
then it checks what the lock or the constraint protects.
"""

import io
import threading
import time

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection, transaction
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import CustomUser, RoleAssignment
from apps.accounts.password_reset import ResetRefused, reset_link, reset_password
from apps.accounts.posts import PostRefused, assign_role
from apps.tickets.lifecycle import assign_ticket, transition_status
from apps.tickets.models import Ticket, TicketAttachment
from tests import factories

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.skipif(
        connection.vendor != "postgresql", reason="row locks need PostgreSQL"
    ),
]

def someone_waits_on_a_lock(timeout=10):
    """Whether another connection is blocked on a lock, polling until `timeout`.

    Read from PostgreSQL itself, so a writer that is merely slow to start is
    never mistaken for one waiting on the row.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM pg_stat_activity"
                " WHERE wait_event_type = 'Lock' AND datname = current_database()"
            )
            if cursor.fetchone()[0]:
                return True
        time.sleep(0.05)
    return False


def in_thread(fn):
    """Run `fn` on its own database connection; the dict gets its result or error."""
    out = {}

    def run():
        try:
            out["value"] = fn()
        except Exception as exc:  # noqa: BLE001 — the test inspects it
            out["error"] = exc
        finally:
            connection.close()

    thread = threading.Thread(target=run)
    thread.start()
    return thread, out


def client_for(user):
    api = APIClient()
    api.force_authenticate(user)
    return api


def at_once(*fns):
    """Start every function on its own thread at the same moment; return their results."""
    barrier = threading.Barrier(len(fns))

    def waiting(fn):
        def go():
            barrier.wait()
            return fn()
        return go

    started = [in_thread(waiting(fn)) for fn in fns]
    for thread, _ in started:
        thread.join(timeout=30)
    return [out for _, out in started]


def _image(name):
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (10, 120, 30)).save(buf, format="JPEG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")


@pytest.fixture
def media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


def test_a_status_change_waits_for_an_escalation_and_keeps_its_level(
    nrb_electrical_ticket, nrb_electrician, nrb_hos
):
    """The escalation run holds the row and moves it to the HOS. The technician's
    status change, arriving meanwhile, must not write the old level back."""
    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    locked, release = threading.Event(), threading.Event()

    def escalate():
        with transaction.atomic():
            ticket = Ticket.objects.select_for_update().get(pk=nrb_electrical_ticket.pk)
            locked.set()
            ticket.current_level = "hos"
            ticket.save(update_fields=["current_level"])
            release.wait(10)

    escalation, _ = in_thread(escalate)
    locked.wait(10)
    change, result = in_thread(
        lambda: client_for(nrb_electrician).post(
            reverse("ticket-status", args=[nrb_electrical_ticket.pk]),
            {"status": "in_progress"},
            format="json",
        )
    )
    assert someone_waits_on_a_lock(), "the status change never reached the row"
    release.set()
    escalation.join(10)
    change.join(10)

    assert result["value"].status_code == 200, result
    stored = Ticket.objects.get(pk=nrb_electrical_ticket.pk)
    assert stored.status == "in_progress"
    assert stored.current_level == "hos"


def test_an_assignment_after_a_claim_sees_the_claim(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, nrb
):
    """The claim holds the row; the HOS's assignment, read meanwhile, waits and
    then reassigns the job the claim already started, rather than undoing it."""
    other = factories.make_technician("elec_two", nrb, [nrb_electrical_ticket.trade])
    locked, release = threading.Event(), threading.Event()

    def claim():
        from apps.tickets.lifecycle import claim_ticket

        with transaction.atomic():
            ticket = Ticket.objects.select_for_update().get(pk=nrb_electrical_ticket.pk)
            locked.set()
            claim_ticket(ticket, nrb_electrician)
            release.wait(10)

    claiming, _ = in_thread(claim)
    locked.wait(10)
    assigning, result = in_thread(
        lambda: client_for(nrb_hos).post(
            reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
            {"assigned_to": other.pk},
            format="json",
        )
    )
    assert someone_waits_on_a_lock(), "the assignment never reached the row"
    release.set()
    claiming.join(10)
    assigning.join(10)

    assert result["value"].status_code == 200, result
    stored = Ticket.objects.get(pk=nrb_electrical_ticket.pk)
    # Reassigned on top of the claim: still in progress, not knocked back to `assigned`.
    assert stored.assigned_to_id == other.pk
    assert stored.status == "in_progress"


def test_two_technicians_claiming_at_once_one_wins(
    nrb_electrical_ticket, nrb_electrician, nrb
):
    other = factories.make_technician("elec_two", nrb, [nrb_electrical_ticket.trade])
    url = reverse("ticket-claim", args=[nrb_electrical_ticket.pk])

    results = at_once(
        lambda: client_for(nrb_electrician).post(url),
        lambda: client_for(other).post(url),
    )

    assert sorted(r["value"].status_code for r in results) == [200, 409], results
    assert Ticket.objects.get(pk=nrb_electrical_ticket.pk).status == "in_progress"


def test_a_close_arriving_during_a_rating_keeps_the_rating(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, requester
):
    """The rating closes the ticket; a close sent meanwhile from another tab
    used to save the row it read first, wiping the rating."""
    from apps.tickets.lifecycle import rate_ticket

    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    transition_status(nrb_electrical_ticket, "in_progress", nrb_electrician)
    transition_status(nrb_electrical_ticket, "resolved", nrb_electrician)
    locked, release = threading.Event(), threading.Event()

    def rate():
        with transaction.atomic():
            ticket = Ticket.objects.select_for_update().get(pk=nrb_electrical_ticket.pk)
            locked.set()
            rate_ticket(ticket, requester, 4, "Fixed fast")
            release.wait(10)

    rating, _ = in_thread(rate)
    locked.wait(10)
    closing, _ = in_thread(
        lambda: client_for(requester).post(
            reverse("ticket-status", args=[nrb_electrical_ticket.pk]),
            {"status": "closed"},
            format="json",
        )
    )
    assert someone_waits_on_a_lock(), "the close never reached the row"
    release.set()
    rating.join(10)
    closing.join(10)

    stored = Ticket.objects.get(pk=nrb_electrical_ticket.pk)
    assert stored.status == "closed"
    assert stored.rating == 4


def test_two_admins_filling_one_post_leave_one_holder():
    """Both read the post as vacant; the database keeps one holder, and the
    other admin is told to reload."""
    campus = factories.make_campus("KSM", "Kisumu")
    first = factories.make_user("first.hos", campus=campus)
    second = factories.make_user("second.hos", campus=campus)

    results = at_once(
        lambda: assign_role(first, "hos", campus=campus),
        lambda: assign_role(second, "hos", campus=campus),
    )

    assert RoleAssignment.objects.filter(role="hos", campus=campus).count() == 1
    errors = [r["error"] for r in results if "error" in r]
    assert all(isinstance(e, PostRefused) for e in errors), errors


def test_one_reset_link_used_twice_at_once_resets_once(requester):
    uid, token = reset_link(requester).split("uid=")[1].split("&token=")

    results = at_once(
        lambda: reset_password(uid, token, "first-sturdy-passphrase-1"),
        lambda: reset_password(uid, token, "second-sturdy-passphrase-2"),
    )

    successes = [r for r in results if "value" in r]
    refused = [r for r in results if isinstance(r.get("error"), ResetRefused)]
    assert (len(successes), len(refused)) == (1, 1), results


def test_a_registration_racing_another_for_one_address_is_a_400_not_a_500(nrb):
    """The first sign-up has written the account but not committed it; the
    second passes validation, then waits on the unique slot and loses."""
    from apps.accounts.serializers import UserCreateSerializer

    body = {"email": "same.person@ksg.ac.ke", "password": "a-sturdy-passphrase-9", "campus_id": nrb.pk}
    written, release = threading.Event(), threading.Event()

    def first():
        with transaction.atomic():
            UserCreateSerializer().create(dict(body))
            written.set()
            release.wait(10)

    def second():
        api = APIClient(raise_request_exception=False)
        return api.post(reverse("auth-register"), body, format="json")

    holding, _ = in_thread(first)
    written.wait(10)
    racing, result = in_thread(second)
    assert someone_waits_on_a_lock(), "the second sign-up never reached the unique slot"
    release.set()
    holding.join(10)
    racing.join(10)

    assert result["value"].status_code == 400, result
    assert "email" in result["value"].json()
    assert CustomUser.objects.filter(email__iexact=body["email"]).count() == 1


def test_two_uploads_at_once_never_pass_the_cap(nrb_hos, nrb_electrical_ticket, media):
    """Five slots, three files each: one upload fits, the other is refused whole."""
    url = reverse("ticket-attachments", args=[nrb_electrical_ticket.pk])

    def upload(prefix):
        return lambda: client_for(nrb_hos).post(
            url, {"files": [_image(f"{prefix}{n}.jpg") for n in range(3)]}, format="multipart"
        )

    results = at_once(upload("a"), upload("b"))

    assert sorted(r["value"].status_code for r in results) == [201, 400], results
    assert TicketAttachment.objects.filter(ticket=nrb_electrical_ticket).count() == 3


def test_a_notification_that_breaks_its_query_does_not_undo_the_ticket(
    nrb_electrical_ticket, nrb_electrician, nrb_hos, monkeypatch
):
    """On PostgreSQL a failed statement aborts the transaction it ran in; the
    emitter's savepoint is what keeps the status change."""
    from apps.notifications import notify

    def broken_query(*args, **kwargs):
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM no_such_table")

    monkeypatch.setattr(notify, "_notify_users", broken_query)

    assign_ticket(nrb_electrical_ticket, nrb_electrician, nrb_hos)
    transition_status(nrb_electrical_ticket, "in_progress", nrb_electrician)

    stored = Ticket.objects.get(pk=nrb_electrical_ticket.pk)
    assert (stored.status, stored.assigned_to_id) == ("in_progress", nrb_electrician.pk)
