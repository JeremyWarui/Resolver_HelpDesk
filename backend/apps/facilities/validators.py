"""What a location of each facility type must state.

`TYPE_SPECS` is the contract: it declares every facility type there is, its
display name, and the location fields that type accepts. `seed` creates the
FacilityType rows from it, so adding a type is one edit here. It is mirrored in
the frontend by `TicketCreationWizard.tsx::FACILITY_FORMS`; change both together.
"""

from rest_framework import serializers

# `label` names the FacilityType row seed creates. The rest are the fields
# offered on top of the facility itself; `known` refuses anything else. There
# is no free-text location: a typed building name cannot be reported on.
TYPE_SPECS = {
    "office_block": {
        "label": "Office Block",
        "required": {"floor", "room"},
        "optional": {"area"},
        "known": {"floor", "room", "area"},
    },
    "hostel": {
        "label": "Hostel",
        # Occupants rotate per course, so the room identifies the fault.
        "required": {"room_number"},
        "optional": {"area"},
        "known": {"room_number", "area"},
    },
    "building": {
        "label": "Building",
        "required": set(),
        "optional": {"room", "area"},
        "known": {"room", "area"},
    },
    "residential": {
        "label": "Staff Quarters",
        # The tenant is who the technician arranges access with.
        "required": {"tenant_name"},
        "optional": {"unit_number"},
        "known": {"tenant_name", "unit_number"},
    },
    "equipment": {
        "label": "Equipment",
        "required": set(),
        "optional": set(),
        "known": set(),
    },
    "grounds": {
        "label": "Grounds / Field",
        "required": set(),
        "optional": {"landmark"},
        "known": {"landmark"},
    },
}


def validate_location(facility, values, requester_campus_id):
    """Validate location data for a ticket.

    Returns {"facility": f, "values": clean_values}, and raises
    rest_framework.serializers.ValidationError on any failure. The facility
    must belong to `requester_campus_id`, and `values` must match its type's
    entry in TYPE_SPECS.

    The facility names its own type, so the caller does not pass one: a second
    copy could only ever disagree with `facility.facility_type`.
    """
    if facility is None:
        raise serializers.ValidationError(
            {"facility": "A facility must be selected for this location type."}
        )
    if facility.campus_id != requester_campus_id:
        raise serializers.ValidationError(
            {
                "facility": (
                    "The selected facility does not belong to the requester's campus."
                )
            }
        )

    type_code = facility.facility_type.code
    spec = TYPE_SPECS.get(type_code)
    if spec is None:
        raise serializers.ValidationError(
            {"facility": f"Unknown facility type code: '{type_code}'."}
        )

    unknown_keys = set(values.keys()) - spec["known"]
    if unknown_keys:
        raise serializers.ValidationError(
            {"values": f"Unknown location field(s): {sorted(unknown_keys)}."}
        )

    missing_keys = spec["required"] - set(values.keys())
    if missing_keys:
        raise serializers.ValidationError(
            {"values": f"Missing required location field(s): {sorted(missing_keys)}."}
        )

    return {
        "facility": facility,
        "values": {k: values[k] for k in spec["known"] if k in values},
    }
