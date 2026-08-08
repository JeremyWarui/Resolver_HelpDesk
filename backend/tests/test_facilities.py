"""Facilities and the location a ticket carries.

Each facility type asks for different location fields, because "where is it"
means something different in a hostel, an office block and a field. The
validator is what stops a ticket arriving with a room number for a lawn.
"""

import pytest
from django.urls import reverse
from rest_framework.serializers import ValidationError

from apps.facilities.models import Facility, FacilityType
from apps.facilities.validators import TYPE_SPECS, validate_location
from apps.tickets.models import Ticket
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def wamalwa(nrb, facility_types):
    """A hostel — identified by room, because occupants rotate per course."""
    return Facility.objects.create(
        campus=nrb, facility_type=facility_types["hostel"], name="Wamalwa", code="NRB-WMW"
    )


@pytest.fixture
def admin_block(nrb, facility_types):
    return Facility.objects.create(
        campus=nrb,
        facility_type=facility_types["office_block"],
        name="Administration Block",
        code="NRB-ADMIN",
    )


# ── The type vocabulary ───────────────────────────────────────────────────────


def test_hostels_and_staff_quarters_ask_for_different_things():
    """Participants rotate through hostel rooms, so the room identifies the
    fault and the occupant is nobody in particular. Staff quarters are a
    standing household, so the tenant is the one who lets the plumber in —
    which makes them the part worth insisting on."""
    assert TYPE_SPECS["hostel"]["required"] == {"room_number"}
    assert TYPE_SPECS["residential"]["required"] == {"tenant_name"}
    assert "unit_number" in TYPE_SPECS["residential"]["optional"]
    assert "tenant_name" not in TYPE_SPECS["hostel"]["known"]


def test_every_type_asks_for_something():
    """Either a named facility off the register or at least one field. A type
    that asks for neither would render an empty form."""
    for code, spec in TYPE_SPECS.items():
        assert spec["required"] or spec["building_dropdown"], code
        assert spec["required"] <= spec["known"], code
        assert spec["optional"] <= spec["known"], code


def test_the_generic_building_is_identified_by_the_facility_alone():
    """Conference centres, dining halls, gate houses and recreational blocks
    all live here. The register already names them, and none has an interior
    scheme worth insisting on — so room and area only narrow it down."""
    spec = TYPE_SPECS["building"]
    assert spec["required"] == set()
    assert spec["building_dropdown"] is True
    assert spec["optional"] == {"room", "area"}


def test_a_building_needs_no_fields_but_still_needs_the_building(nrb, facility_types):
    hall = Facility.objects.create(
        campus=nrb, facility_type=facility_types["building"], name="Conference Center"
    )
    result = validate_location(facility_types["building"], hall, {}, nrb.id)
    assert result["facility"] == hall

    with pytest.raises(ValidationError):
        validate_location(facility_types["building"], None, {"area": "Main hall"}, nrb.id)


# ── Validation ────────────────────────────────────────────────────────────────


def test_a_valid_hostel_location_is_accepted(wamalwa, nrb, facility_types):
    result = validate_location(
        facility_types["hostel"], wamalwa, {"room_number": "B-214"}, nrb.id
    )
    assert result["values"]["room_number"] == "B-214"


def test_a_missing_required_field_is_rejected(wamalwa, nrb, facility_types):
    with pytest.raises(ValidationError):
        validate_location(facility_types["hostel"], wamalwa, {}, nrb.id)


def test_fields_from_another_type_are_rejected(wamalwa, nrb, facility_types):
    """A hostel has no floors-and-rooms form; accepting one would store a
    location no technician can act on."""
    with pytest.raises(ValidationError):
        validate_location(
            facility_types["hostel"], wamalwa, {"room_number": "B-1", "floor": "2"}, nrb.id
        )


def test_office_blocks_need_both_floor_and_room(admin_block, nrb, facility_types):
    with pytest.raises(ValidationError):
        validate_location(facility_types["office_block"], admin_block, {"floor": "2"}, nrb.id)

    result = validate_location(
        facility_types["office_block"], admin_block, {"floor": "2", "room": "204"}, nrb.id
    )
    assert result["values"]["room"] == "204"


def test_a_facility_from_another_campus_is_rejected(wamalwa, msa, facility_types):
    """Otherwise a Mombasa requester could file against a Nairobi hostel and
    the ticket would route to a technician who cannot reach it."""
    with pytest.raises(ValidationError):
        validate_location(facility_types["hostel"], wamalwa, {"room_number": "B-1"}, msa.id)


def test_grounds_need_a_zone_not_a_room(nrb, facility_types):
    field = Facility.objects.create(
        campus=nrb, facility_type=facility_types["grounds"], name="Field", code="NRB-FIELD"
    )
    with pytest.raises(ValidationError):
        validate_location(facility_types["grounds"], field, {"room": "1"}, nrb.id)

    result = validate_location(facility_types["grounds"], field, {"zone": "North lawn"}, nrb.id)
    assert result["values"]["zone"] == "North lawn"


# ── Facilities on tickets ─────────────────────────────────────────────────────


def test_a_ticket_can_carry_a_location(
    api, requester, nrb_section, electrical, wamalwa, facility_types, priorities
):
    item = factories.make_service_item(electrical, "Faulty socket")

    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"),
        {
            "service_item": item.pk,
            "description": "no power",
            "location": {
                "facility_type": facility_types["hostel"].pk,
                "facility": wamalwa.pk,
                "values": {"room_number": "B-214"},
            },
        },
        format="json",
    )
    assert response.status_code == 201, response.json()

    ticket = Ticket.objects.select_related("location").get(pk=response.json()["id"])
    assert ticket.location.facility_id == wamalwa.pk
    assert ticket.location.values == {"room_number": "B-214"}


def test_one_campus_call_carries_everything_the_wizard_draws(
    api, requester, nrb, msa, wamalwa, admin_block, facility_types
):
    """The wizard fetches a campus's facilities once and groups them by type
    itself. That only works if each row names its own type — otherwise the
    client needs a second call to /facility-types/ just to label the tiles."""
    Facility.objects.create(
        campus=msa, facility_type=facility_types["hostel"], name="Galana"
    )

    api.force_authenticate(requester)
    response = api.get(reverse("facility-list"), {"campus": nrb.id})
    assert response.status_code == 200
    rows = response.json()
    rows = rows if isinstance(rows, list) else rows["results"]

    assert {row["name"] for row in rows} == {"Wamalwa", "Administration Block"}
    hostel = next(row for row in rows if row["name"] == "Wamalwa")
    assert hostel["type"] == "hostel"
    assert hostel["facility_type_name"] == facility_types["hostel"].name
    assert hostel["facility_type"] == facility_types["hostel"].pk


def test_every_campus_may_reuse_a_facility_name(nrb, msa, facility_types):
    """"Administration Block" exists at all five campuses — the natural key is
    (campus, name), not name alone."""
    Facility.objects.create(
        campus=nrb, facility_type=facility_types["office_block"], name="Administration Block"
    )
    Facility.objects.create(
        campus=msa, facility_type=facility_types["office_block"], name="Administration Block"
    )
    assert Facility.objects.filter(name="Administration Block").count() == 2


def test_one_campus_may_not_have_two_facilities_of_the_same_name(nrb, facility_types):
    from django.db import IntegrityError, transaction

    Facility.objects.create(
        campus=nrb, facility_type=facility_types["office_block"], name="Administration Block"
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        Facility.objects.create(
            campus=nrb, facility_type=facility_types["building"], name="Administration Block"
        )
