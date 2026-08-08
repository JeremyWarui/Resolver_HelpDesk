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
def types(db):
    return {
        code: FacilityType.objects.create(name=code.replace("_", " ").title(), code=code)
        for code in TYPE_SPECS
    }


@pytest.fixture
def wamalwa(nrb, types):
    """A hostel — identified by room, because occupants rotate per course."""
    return Facility.objects.create(
        campus=nrb, facility_type=types["hostel"], name="Wamalwa", code="NRB-WMW"
    )


@pytest.fixture
def admin_block(nrb, types):
    return Facility.objects.create(
        campus=nrb,
        facility_type=types["office_block"],
        name="Administration Block",
        code="NRB-ADMIN",
    )


# ── The type vocabulary ───────────────────────────────────────────────────────


def test_hostels_and_staff_quarters_ask_for_different_things():
    """Participants rotate through hostel rooms, so the room identifies the
    fault. Staff quarters are a standing household, so the tenant matters —
    somebody has to let the plumber in."""
    assert TYPE_SPECS["hostel"]["required"] == {"room_number"}
    assert TYPE_SPECS["residential"]["required"] == {"unit_number"}
    assert "tenant_name" in TYPE_SPECS["residential"]["optional"]
    assert "tenant_name" not in TYPE_SPECS["hostel"]["known"]


def test_every_type_declares_a_complete_spec():
    for code, spec in TYPE_SPECS.items():
        assert spec["required"], f"{code} requires nothing — the form would be empty"
        assert spec["required"] <= spec["known"], code
        assert spec["optional"] <= spec["known"], code


# ── Validation ────────────────────────────────────────────────────────────────


def test_a_valid_hostel_location_is_accepted(wamalwa, nrb, types):
    result = validate_location(
        types["hostel"], wamalwa, {"room_number": "B-214"}, nrb.id
    )
    assert result["values"]["room_number"] == "B-214"


def test_a_missing_required_field_is_rejected(wamalwa, nrb, types):
    with pytest.raises(ValidationError):
        validate_location(types["hostel"], wamalwa, {}, nrb.id)


def test_fields_from_another_type_are_rejected(wamalwa, nrb, types):
    """A hostel has no floors-and-rooms form; accepting one would store a
    location no technician can act on."""
    with pytest.raises(ValidationError):
        validate_location(
            types["hostel"], wamalwa, {"room_number": "B-1", "floor": "2"}, nrb.id
        )


def test_office_blocks_need_both_floor_and_room(admin_block, nrb, types):
    with pytest.raises(ValidationError):
        validate_location(types["office_block"], admin_block, {"floor": "2"}, nrb.id)

    result = validate_location(
        types["office_block"], admin_block, {"floor": "2", "room": "204"}, nrb.id
    )
    assert result["values"]["room"] == "204"


def test_a_facility_from_another_campus_is_rejected(wamalwa, msa, types):
    """Otherwise a Mombasa requester could file against a Nairobi hostel and
    the ticket would route to a technician who cannot reach it."""
    with pytest.raises(ValidationError):
        validate_location(types["hostel"], wamalwa, {"room_number": "B-1"}, msa.id)


def test_grounds_need_a_zone_not_a_room(nrb, types):
    field = Facility.objects.create(
        campus=nrb, facility_type=types["grounds"], name="Field", code="NRB-FIELD"
    )
    with pytest.raises(ValidationError):
        validate_location(types["grounds"], field, {"room": "1"}, nrb.id)

    result = validate_location(types["grounds"], field, {"zone": "North lawn"}, nrb.id)
    assert result["values"]["zone"] == "North lawn"


# ── Facilities on tickets ─────────────────────────────────────────────────────


def test_a_ticket_can_carry_a_location(
    api, requester, nrb_section, electrical, wamalwa, types, priorities
):
    electrical.location_details = True
    electrical.save(update_fields=["location_details"])
    item = factories.make_service_item(electrical, "Faulty socket")

    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"),
        {
            "service_item": item.pk,
            "description": "no power",
            "location": {
                "facility_type": types["hostel"].pk,
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


def test_every_campus_may_reuse_a_facility_name(nrb, msa, types):
    """"Administration Block" exists at all five campuses — the natural key is
    (campus, name), not name alone."""
    Facility.objects.create(
        campus=nrb, facility_type=types["office_block"], name="Administration Block"
    )
    Facility.objects.create(
        campus=msa, facility_type=types["office_block"], name="Administration Block"
    )
    assert Facility.objects.filter(name="Administration Block").count() == 2


def test_one_campus_may_not_have_two_facilities_of_the_same_name(nrb, types):
    from django.db import IntegrityError, transaction

    Facility.objects.create(
        campus=nrb, facility_type=types["office_block"], name="Administration Block"
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        Facility.objects.create(
            campus=nrb, facility_type=types["building"], name="Administration Block"
        )
