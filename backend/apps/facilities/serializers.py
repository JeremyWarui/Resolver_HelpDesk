"""Read and write shapes for the facility registry."""

from rest_framework import serializers

from apps.facilities.models import Facility, FacilityType


class FacilityTypeSerializer(serializers.ModelSerializer):
    """A facility type: the code picks the location form, the name labels it."""

    class Meta:
        model = FacilityType
        fields = ["id", "name", "code"]


class FacilitySerializer(serializers.ModelSerializer):
    """A registered place.

    Carrying the type's code and name means one `?campus=` call gives the
    ticket wizard both the type tiles and the facility dropdown, with no second
    fetch of the type list.
    """

    campus_name = serializers.CharField(source="campus.name", read_only=True)
    facility_type_code = serializers.CharField(
        source="facility_type.code", read_only=True
    )
    facility_type_name = serializers.CharField(
        source="facility_type.name", read_only=True
    )

    class Meta:
        model = Facility
        fields = [
            "id",
            "name",
            "code",
            "campus",
            "campus_name",
            "facility_type",
            "facility_type_code",
            "facility_type_name",
        ]
