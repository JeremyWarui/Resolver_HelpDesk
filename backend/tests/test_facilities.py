"""Facilities and the location a ticket carries.

Every location is a registered facility at the requester's own campus, and each
type asks for whatever its own name does not already say.
"""

import pytest
from django.urls import reverse
from rest_framework.serializers import ValidationError

from apps.facilities.models import Facility
from apps.facilities.validators import validate_location

pytestmark = pytest.mark.django_db


@pytest.fixture
def wamalwa(nrb, facility_types):
    """A hostel — identified by room, because occupants rotate per course."""
    return Facility.objects.create(
        campus=nrb,
        facility_type=facility_types["hostel"],
        name="Wamalwa",
        code="NRB-WMW",
    )


@pytest.fixture
def admin_block(nrb, facility_types):
    return Facility.objects.create(
        campus=nrb,
        facility_type=facility_types["office_block"],
        name="Administration Block",
        code="NRB-ADMIN",
    )


def test_every_location_names_a_registered_facility(nrb, facility_types):
    """No type is located by free text: a location outside the registry is a
    location outside every report drawn from it.
    """
    with pytest.raises(ValidationError):
        validate_location(None, {}, nrb.id)


def test_equipment_is_identified_by_the_asset_itself(nrb, facility_types):
    """A generator is registered by name like any other place, so the wizard
    has nothing left to ask about which one it is."""
    generator = Facility.objects.create(
        campus=nrb,
        facility_type=facility_types["equipment"],
        name="Standby Generator",
        code="NRB-GEN",
    )
    result = validate_location(generator, {}, nrb.id)
    assert result["facility"] == generator
    assert result["values"] == {}


def test_staff_quarters_still_name_the_tenant(nrb, facility_types):
    """The block is the facility, but the technician needs to know whose door
    to knock on to arrange access."""
    quarters = Facility.objects.create(
        campus=nrb, facility_type=facility_types["residential"], name="Staff Quarters A"
    )
    result = validate_location(quarters, {"tenant_name": "J. Mwangi"}, nrb.id)
    assert result["values"]["tenant_name"] == "J. Mwangi"

    with pytest.raises(ValidationError):
        validate_location(quarters, {}, nrb.id)


def test_a_valid_hostel_location_is_accepted(wamalwa, nrb, facility_types):
    result = validate_location(wamalwa, {"room_number": "B-214"}, nrb.id)
    assert result["values"]["room_number"] == "B-214"


def test_a_missing_required_field_is_rejected(wamalwa, nrb, facility_types):
    with pytest.raises(ValidationError):
        validate_location(wamalwa, {}, nrb.id)


def test_fields_from_another_type_are_rejected(wamalwa, nrb, facility_types):
    """A hostel has no floors-and-rooms form; accepting one would store a
    location no technician can act on."""
    with pytest.raises(ValidationError):
        validate_location(wamalwa, {"room_number": "B-1", "floor": "2"}, nrb.id)


def test_a_facility_from_another_campus_is_rejected(wamalwa, msa, facility_types):
    """Otherwise a Mombasa requester could file against a Nairobi hostel and
    the ticket would route to a technician who cannot reach it."""
    with pytest.raises(ValidationError):
        validate_location(wamalwa, {"room_number": "B-1"}, msa.id)


def test_a_facility_row_carries_its_type_and_its_ticket_counts(
    api,
    requester,
    nrb,
    facility_types,
    admin_block,
):
    """One `?campus=` call has to give the wizard the type tiles and the
    dropdown at once, and the Facilities screen the volume per building — §5's
    facility figure.
    """
    api.force_authenticate(requester)
    rows = api.get(reverse("facility-list"), {"campus": nrb.pk}).json()["results"]

    row = next(r for r in rows if r["id"] == admin_block.pk)
    assert row["facility_type_code"] == "office_block"
    assert row["facility_type_name"] == facility_types["office_block"].name
    assert row["campus_name"] == nrb.name
    assert (row["open_tickets"], row["resolved_tickets"], row["closed_tickets"]) == (
        0,
        0,
        0,
    )


def test_a_facility_counts_the_tickets_raised_against_it(
    api,
    admin_user,
    requester,
    nrb,
    electrical,
    admin_block,
    priorities,
):
    """The count is what makes the registry a report rather than a list."""
    from apps.tickets.models import TicketLocation
    from tests import factories

    ticket = factories.make_ticket(requester, nrb, electrical)
    TicketLocation.objects.create(
        ticket=ticket,
        facility=admin_block,
        values={"floor": "1", "room": "104"},
    )

    api.force_authenticate(admin_user)
    rows = api.get(reverse("facility-list"), {"campus": nrb.pk}).json()["results"]

    row = next(r for r in rows if r["id"] == admin_block.pk)
    assert row["open_tickets"] == 1


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
