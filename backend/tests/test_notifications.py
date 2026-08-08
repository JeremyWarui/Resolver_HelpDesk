"""Notifications — generated on the backend, fetched by polling.

WebSockets are gone, so these rows are the only record that something happened.
The tests that matter are the ones proving each domain event actually writes
them, and to the right people: a notification nobody receives is the same as no
notification at all.
"""

import pytest
from django.urls import reverse

from apps.notifications.models import Notification
from apps.tickets.services.lifecycle import claim_ticket, transition_status

pytestmark = pytest.mark.django_db


def _for(user, event=None):
    qs = Notification.objects.filter(user=user)
    return qs.filter(event_type=event) if event else qs


# ── The events ────────────────────────────────────────────────────────────────


def test_raising_a_ticket_tells_the_supervisors(
    api, requester, nrb_section, electrical, nrb_hos, nrb_hod, priorities, somewhere
):
    from tests import factories

    item = factories.make_service_item(electrical, "Dead socket")
    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"),
        {"service_item": item.pk, "description": "no power", "location": somewhere},
        format="json",
    )
    assert response.status_code == 201, response.json()

    assert _for(nrb_hos, "ticket_created").exists()
    assert _for(nrb_hod, "ticket_created").exists()
    # The requester already knows — they just filed it.
    assert not _for(requester, "ticket_created").exists()


def test_assigning_tells_the_technician_and_the_requester(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, requester
):
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )
    assert response.status_code == 200, response.json()

    assert _for(nrb_electrician, "ticket_assigned").exists()
    assert _for(requester, "ticket_assigned").exists()


def test_resolving_asks_the_requester_to_rate_it(
    nrb_electrical_ticket, nrb_electrician, requester
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "in_progress"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])

    transition_status(nrb_electrical_ticket, "resolved", nrb_electrician, "done")

    note = _for(requester, "ticket_resolved").get()
    assert "rate" in note.body.lower()


def test_a_status_change_short_of_resolved_still_reaches_the_requester(
    nrb_electrical_ticket, nrb_electrician, requester
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "assigned"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])

    transition_status(nrb_electrical_ticket, "in_progress", nrb_electrician)
    assert _for(requester, "ticket_status_changed").exists()


def test_claiming_notifies_like_an_assignment(
    nrb_electrical_ticket, nrb_electrician, requester
):
    claim_ticket(nrb_electrical_ticket, nrb_electrician)
    assert _for(nrb_electrician, "ticket_assigned").exists()
    assert _for(requester, "ticket_assigned").exists()


def test_a_comment_reaches_the_requester_but_not_its_own_author(
    api, nrb_electrician, nrb_electrical_ticket, requester
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "in_progress"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])

    api.force_authenticate(nrb_electrician)
    response = api.post(
        reverse("ticket-comments", args=[nrb_electrical_ticket.pk]),
        {"body": "Parts ordered"},
        format="json",
    )
    assert response.status_code == 201, response.json()

    assert _for(requester, "comment_added").exists()
    assert not _for(nrb_electrician, "comment_added").exists()


def test_a_notification_failure_never_breaks_the_ticket(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, monkeypatch
):
    """The emitters swallow their own errors on purpose: a ticket update is the
    work, the notification is the courtesy."""
    import apps.notifications.notify as notify

    def boom(*args, **kwargs):
        raise RuntimeError("notification backend down")

    monkeypatch.setattr(notify, "_notify_users", boom)

    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )
    assert response.status_code == 200
    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.assigned_to_id == nrb_electrician.pk


# ── The feed ──────────────────────────────────────────────────────────────────


def test_the_feed_is_the_callers_own(api, requester, nrb_hos, nrb_electrical_ticket):
    Notification.objects.create(
        user=nrb_hos, event_type="ticket_created", title="t", body="b"
    )
    api.force_authenticate(requester)
    body = api.get(reverse("notifications-list")).json()
    assert body["data"] == []
    assert body["unreadCount"] == 0


def test_the_unread_count_comes_from_the_server(api, requester):
    for _ in range(3):
        Notification.objects.create(
            user=requester, event_type="ticket_created", title="t", body="b"
        )
    body = (api.force_authenticate(requester), api.get(reverse("notifications-list")))[1].json()
    assert body["unreadCount"] == 3


def test_mark_all_read_is_reachable_at_the_path_the_client_posts_to(api, requester):
    """The route carries a trailing slash. Posting without one is redirected by
    APPEND_SLASH, which turns the POST into a GET and then a 405 — so the exact
    path matters, and the frontend must send this one."""
    Notification.objects.create(
        user=requester, event_type="ticket_created", title="t", body="b"
    )
    api.force_authenticate(requester)
    assert reverse("notifications-read-all") == "/api/v1/notifications/read-all/"
    assert api.post("/api/v1/notifications/read-all/").status_code == 204
    assert not Notification.objects.filter(user=requester, read=False).exists()


def test_marking_one_read_leaves_the_others(api, requester):
    a = Notification.objects.create(
        user=requester, event_type="ticket_created", title="a", body="b"
    )
    Notification.objects.create(
        user=requester, event_type="ticket_created", title="b", body="b"
    )
    api.force_authenticate(requester)
    assert api.patch(f"/api/v1/notifications/{a.pk}/read").status_code == 204
    assert Notification.objects.filter(user=requester, read=False).count() == 1


def test_another_users_notification_cannot_be_marked_read(api, requester, nrb_hos):
    theirs = Notification.objects.create(
        user=nrb_hos, event_type="ticket_created", title="t", body="b"
    )
    api.force_authenticate(requester)
    assert api.patch(f"/api/v1/notifications/{theirs.pk}/read").status_code == 404
    theirs.refresh_from_db()
    assert theirs.read is False


def test_the_feed_requires_authentication(api):
    assert api.get(reverse("notifications-list")).status_code == 401
