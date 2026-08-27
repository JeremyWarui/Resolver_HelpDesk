"""Read and write shapes for the facility registry."""

from rest_framework import serializers

from apps.facilities.models import Facility, FacilityType


class FacilityTypeSerializer(serializers.ModelSerializer):
    """A facility type: the code picks the location form, the name labels it."""

    class Meta:
        model = FacilityType
        fields = ["id", "name", "code"]


class _TicketCountField(serializers.IntegerField):
    """One of the ticket counts `FacilityViewSet` annotates onto a row.

    Zero when the annotation is absent, which is the case on the instance a
    POST hands back: it was just created, so it has no tickets anyway.
    """

    def __init__(self, annotation, **kwargs):
        self.annotation = annotation
        super().__init__(read_only=True, **kwargs)

    def get_attribute(self, instance):
        return getattr(instance, self.annotation, 0) or 0


class FacilitySerializer(serializers.ModelSerializer):
    """A registered place, with the ticket counts against it.

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
    open_tickets = _TicketCountField("open_ticket_count")
    resolved_tickets = _TicketCountField("resolved_ticket_count")
    closed_tickets = _TicketCountField("closed_ticket_count")

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
            "open_tickets",
            "resolved_tickets",
            "closed_tickets",
        ]
