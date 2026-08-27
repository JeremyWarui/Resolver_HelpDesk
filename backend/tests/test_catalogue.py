"""The catalogue, and the routing it drives.

Picking a service item is the only routing decision a requester makes.
Everything else — which section handles it, which trade, which campus — is
derived server-side from that one choice plus the requester's own campus.
"""

import pytest
from django.urls import reverse

from apps.org.models import SubSection
from apps.tickets.models import Ticket
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def socket(electrical):
    return factories.make_service_item(electrical, "Faulty socket")


def test_every_campus_offers_every_active_trade(nrb, electrical, plumbing):
    """Trades are global: one Maintenance section per campus, all five crafts."""
    codes = {sub.code for sub in SubSection.objects.filter(is_active=True)}
    assert codes == {electrical.code, plumbing.code}


def test_creating_a_ticket_derives_trade_and_campus(
    api,
    requester,
    nrb,
    electrical,
    socket,
    priorities,
    somewhere,
):
    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"),
        {"service_item": socket.pk, "description": "no power", "location": somewhere},
        format="json",
    )
    assert response.status_code == 201, response.json()

    ticket = Ticket.objects.get(pk=response.json()["id"])
    assert ticket.sub_section_id == electrical.pk
    assert ticket.requester_campus_id == nrb.id


def test_a_user_without_a_campus_cannot_raise_a_ticket(
    api,
    nrb,
    socket,
    priorities,
    db,
):
    """Routing has nowhere to start, so fail at creation rather than produce a
    ticket no section owns."""
    stray = factories.make_user("no_campus", campus=None, role="user")
    api.force_authenticate(stray)
    response = api.post(
        reverse("ticket-list"), {"service_item": socket.pk}, format="json"
    )
    assert response.status_code == 400


def test_every_ticket_must_say_where_it_is(
    api,
    requester,
    nrb,
    electrical,
    socket,
    priorities,
):
    """Maintenance work happens somewhere. A ticket the technician cannot find
    is not a ticket, so there is no service for which the question is skipped."""
    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"), {"service_item": socket.pk}, format="json"
    )
    assert response.status_code == 400
    assert "location" in response.json()


def test_a_ticket_can_be_raised_at_a_newly_added_campus(
    api,
    admin_user,
    electrical,
    facility_types,
    priorities,
):
    """A bare Campus row is usable the moment it exists: trades are global and
    routing is (campus, trade), so there is no chain left to provision. This
    drives the whole way through: add the campus, register a place on it, put
    someone there, raise."""
    from apps.facilities.models import Facility
    from apps.org.models import Campus

    api.force_authenticate(admin_user)
    api.post(reverse("campus-list"), {"name": "Kisumu", "code": "KSM"}, format="json")
    campus = Campus.objects.get(code="KSM")

    facility = Facility.objects.create(
        campus=campus, facility_type=facility_types["grounds"], name="Car Park"
    )
    item = factories.make_service_item(electrical)
    requester = factories.make_user("ksm_requester", campus=campus, role="user")

    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"),
        {
            "service_item": item.pk,
            "description": "No power",
            "location": {"facility": facility.pk, "values": {}},
        },
        format="json",
    )
    assert response.status_code == 201, response.content
