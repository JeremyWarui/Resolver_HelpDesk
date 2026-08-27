"""Notifications — generated on the backend, fetched by polling.

These rows are the only record that something happened, so the tests that
matter are the ones proving each domain event writes them, and to the right
people: a notification nobody receives is the same as no notification at all.
"""

import pytest
from django.urls import reverse

from apps.notifications.models import Notification
from tests import factories

pytestmark = pytest.mark.django_db


def _for(user, event=None):
    qs = Notification.objects.filter(user=user)
    return qs.filter(event_type=event) if event else qs


def test_raising_a_ticket_tells_the_supervisors(
    api,
    requester,
    nrb,
    electrical,
    nrb_hos,
    nrb_hod,
    priorities,
    somewhere,
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
    api,
    nrb_hos,
    nrb_electrician,
    nrb_electrical_ticket,
    requester,
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


def test_the_feed_is_the_callers_own(api, requester, nrb_hos, nrb_electrical_ticket):
    Notification.objects.create(
        user=nrb_hos, event_type="ticket_created", title="t", body="b"
    )
    api.force_authenticate(requester)
    body = api.get(reverse("notifications-list")).json()
    assert body["data"] == []
    assert body["unreadCount"] == 0


def test_another_users_notification_cannot_be_marked_read(api, requester, nrb_hos):
    theirs = Notification.objects.create(
        user=nrb_hos, event_type="ticket_created", title="t", body="b"
    )
    api.force_authenticate(requester)
    # reverse(), not a literal path: a slashless literal asserts against
    # APPEND_SLASH's 301 instead of the 404 the view returns.
    url = reverse("notification-mark-read", args=[theirs.pk])
    assert api.patch(url).status_code == 404
    theirs.refresh_from_db()
    assert theirs.read is False

