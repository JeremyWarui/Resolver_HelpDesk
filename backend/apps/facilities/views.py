"""Facility and facility-type endpoints.

The registry, and nothing about the tickets raised against it: how a facility
is performing is a reporting question, and `analytics` answers it with a
facility breakdown drawn over the caller's own scope.
"""

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.common.roles import IsAdminOrReadOnly
from apps.facilities.models import Facility, FacilityType
from apps.facilities.serializers import FacilitySerializer, FacilityTypeSerializer


class FacilityTypeViewSet(ReadOnlyModelViewSet):
    """The six types, read only.

    Each code has a matching entry in `facilities.validators.TYPE_SPECS` and a
    form in the ticket wizard, so adding a seventh is a code change, not a row
    an admin can insert. Readable by anyone signed in — the wizard needs it to
    pick a location form.
    """

    queryset = FacilityType.objects.all().order_by("name")
    serializer_class = FacilityTypeSerializer
    permission_classes = [IsAuthenticated]


class FacilityViewSet(viewsets.ModelViewSet):
    """The facility registry: admin CRUD, readable by anyone signed in.

    `?campus=` and `?facility_type=` narrow it, which is what the ticket
    wizard's location dropdown sends. Reads are open because every requester
    has to pick a facility to raise a ticket at all.
    """

    serializer_class = FacilitySerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = Facility.objects.select_related("campus", "facility_type").order_by(
            "campus", "name"
        )
        campus = self.request.query_params.get("campus")
        facility_type = self.request.query_params.get("facility_type")
        if campus:
            qs = qs.filter(campus_id=campus)
        if facility_type:
            qs = qs.filter(facility_type__code=facility_type)
        return qs
