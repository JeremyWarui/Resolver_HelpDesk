"""Facility and facility-type endpoints.

The registry, and nothing about the tickets raised against it: how a facility
is performing is a reporting question, and `analytics` answers it with a
facility breakdown drawn over the caller's own scope.
"""

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from django.db.models import Q

from apps.accounts.scope import UNSCOPED_ROLES, visible_campuses
from apps.common.roles import IsAdminOrReadOnly, resolve_role
from apps.facilities.models import Facility, FacilityType
from apps.facilities.serializers import FacilitySerializer, FacilityTypeSerializer


class FacilityTypeViewSet(ReadOnlyModelViewSet):
    """The facility types from `facilities.models.FACILITY_TYPES`, read only."""

    queryset = FacilityType.objects.all().order_by("name")
    serializer_class = FacilityTypeSerializer
    permission_classes = [IsAuthenticated]


class FacilityViewSet(viewsets.ModelViewSet):
    """The facility registry: admin CRUD, read within the caller's campuses.

    The admin and the manager read every campus. Everyone else reads their
    home campus, where they raise tickets, plus any campus their post or
    trades cover. `?campus=` and `?facility_type=` narrow it further.
    """

    serializer_class = FacilitySerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = Facility.objects.select_related("campus", "facility_type").order_by(
            "campus", "name"
        )
        user = self.request.user
        role = resolve_role(self.request)
        if role not in UNSCOPED_ROLES:
            qs = qs.filter(
                Q(campus__in=visible_campuses(user, role)) | Q(campus_id=user.campus_id)
            )
        campus = self.request.query_params.get("campus")
        facility_type = self.request.query_params.get("facility_type")
        if campus:
            qs = qs.filter(campus_id=campus)
        if facility_type:
            qs = qs.filter(facility_type__code=facility_type)
        return qs
