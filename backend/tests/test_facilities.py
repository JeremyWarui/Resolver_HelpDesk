"""Facilities and the location a ticket carries.

Every location is a registered facility at the requester's own campus, plus
one line of free text saying where in it.
"""

import pytest
from django.urls import reverse

from apps.facilities.models import Facility
from apps.tickets.models import Ticket
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def wamalwa(nrb, facility_types):
    return Facility.objects.create(
        campus=nrb,
        facility_type=facility_types["hostel"],
        name="Wamalwa",
    )


@pytest.fixture
def admin_block(nrb, facility_types):
    return Facility.objects.create(
        campus=nrb,
        facility_type=facility_types["office_block"],
        name="Administration Block",
    )


@pytest.fixture
def raise_at(api, requester, electrical, priorities):
    """POST a ticket at `location` as the Nairobi requester."""
    item = factories.make_service_item(electrical)

    def post(location):
        api.force_authenticate(requester)
        return api.post(
            reverse("ticket-list"),
            {"service_item": item.pk, "location": location, "description": "x"},
            format="json",
        )

    return post


def test_a_ticket_stores_its_facility_and_the_spot_in_it(raise_at, wamalwa):
    response = raise_at({"facility": wamalwa.pk, "detail": "  Room B-214  "})

    assert response.status_code == 201
    ticket = Ticket.objects.get(pk=response.json()["id"])
    assert ticket.facility == wamalwa
    assert ticket.location_detail == "Room B-214"


def test_the_detail_shape_returns_the_location(api, raise_at, requester, wamalwa):
    ticket_id = raise_at({"facility": wamalwa.pk, "detail": "Room B-214"}).json()["id"]

    location = api.get(reverse("ticket-detail", args=[ticket_id])).json()["location"]
    assert location["facility"]["name"] == "Wamalwa"
    assert location["facility_type"]["code"] == "hostel"
    assert location["detail"] == "Room B-214"


@pytest.mark.parametrize("detail", [None, "", "   "])
def test_a_location_without_the_spot_is_rejected(raise_at, wamalwa, detail):
    location = {"facility": wamalwa.pk}
    if detail is not None:
        location["detail"] = detail
    assert raise_at(location).status_code == 400


def test_the_spot_is_at_most_200_characters(raise_at, wamalwa):
    assert raise_at({"facility": wamalwa.pk, "detail": "x" * 201}).status_code == 400
    assert raise_at({"facility": wamalwa.pk, "detail": "x" * 200}).status_code == 201


def test_a_location_without_a_facility_is_rejected(raise_at):
    assert raise_at({"detail": "Room 4"}).status_code == 400


def test_a_facility_from_another_campus_is_rejected(raise_at, msa, facility_types):
    """Otherwise a Nairobi requester could file against a Mombasa hostel and
    the ticket would route to a technician who cannot reach it."""
    elsewhere = Facility.objects.create(
        campus=msa, facility_type=facility_types["hostel"], name="Coast Hostel"
    )
    response = raise_at({"facility": elsewhere.pk, "detail": "Room 1"})
    assert response.status_code == 400
    assert not Ticket.objects.exists()


@pytest.fixture
def two_campuses(nrb, msa, facility_types):
    return (
        Facility.objects.create(campus=nrb, facility_type=facility_types["hostel"], name="NRB Hall"),
        Facility.objects.create(campus=msa, facility_type=facility_types["hostel"], name="MSA Hall"),
    )


def _facility_names(api, user):
    api.force_authenticate(user)
    rows = api.get(reverse("facility-list"), {"page_size": 100}).json()["results"]
    return {r["name"] for r in rows}


@pytest.mark.parametrize("role", ["nrb_hos", "nrb_hod", "requester", "nrb_electrician"])
def test_campus_staff_and_requesters_read_only_their_own_campus_facilities(
    api, request, two_campuses, role
):
    assert _facility_names(api, request.getfixturevalue(role)) == {"NRB Hall"}


@pytest.mark.parametrize("role", ["admin_user", "manager"])
def test_the_admin_and_manager_read_every_campus_facilities(
    api, request, two_campuses, role
):
    assert _facility_names(api, request.getfixturevalue(role)) == {"NRB Hall", "MSA Hall"}


def test_an_hos_cannot_reach_another_campus_facility_by_id(api, nrb_hos, two_campuses):
    api.force_authenticate(nrb_hos)
    _, elsewhere = two_campuses
    assert api.get(reverse("facility-detail", args=[elsewhere.pk])).status_code == 404


def test_a_facility_row_carries_its_type(
    api,
    requester,
    nrb,
    facility_types,
    admin_block,
):
    """One `?campus=` call has to give the wizard the type tiles and the
    dropdown at once."""
    api.force_authenticate(requester)
    rows = api.get(reverse("facility-list"), {"campus": nrb.pk}).json()["results"]

    row = next(r for r in rows if r["id"] == admin_block.pk)
    assert row["facility_type_code"] == "office_block"
    assert row["facility_type_name"] == facility_types["office_block"].name
    assert row["campus_name"] == nrb.name


def test_the_facility_registry_is_readable_by_everyone_and_writable_by_admins(
    api,
    requester,
    admin_user,
    nrb,
    facility_types,
):
    """Read-open, write-admin, from the shared `IsAdminOrReadOnly`. Both halves
    are asserted here.
    """
    from django.urls import reverse

    url = reverse("facility-list")
    payload = {
        "campus": nrb.pk,
        "facility_type": facility_types["office_block"].pk,
        "name": "Registry Block",
    }

    api.force_authenticate(requester)
    assert api.get(url).status_code == 200
    assert api.post(url, payload, format="json").status_code == 403

    api.force_authenticate(admin_user)
    assert api.post(url, payload, format="json").status_code == 201
    assert Facility.objects.filter(name="Registry Block").exists()
