"""Facility and facility-type endpoints, with per-facility ticket counts."""

from django.db.models import Count, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.common.pagination import ConfigListPagination
from apps.common.roles import IsAdminOrReadOnly
from apps.facilities.models import Facility, FacilityType
from apps.facilities.serializers import FacilitySerializer, FacilityTypeSerializer
from apps.tickets.constants import ACTIVE_STATUSES
from apps.tickets.models import TicketLocation


def _ticket_count_subq(status_filter: Q):
    """Count this facility's TicketLocation rows matching a ticket status.

    A subquery rather than a reverse annotation, because
    `TicketLocation.facility` carries related_name="+" — and because three
    joined counts on one row would multiply each other.
    """
    return Coalesce(
        Subquery(
            TicketLocation.objects.filter(facility=OuterRef("pk"))
            .filter(status_filter)
            .values("facility")
            .annotate(c=Count("id"))
            .values("c"),
            output_field=IntegerField(),
        ),
        0,
    )


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
    pagination_class = ConfigListPagination


class FacilityViewSet(viewsets.ModelViewSet):
    """The facility registry: admin CRUD, readable by anyone signed in.

    `?campus=` and `?facility_type=` narrow it, which is what the ticket
    wizard's location dropdown sends. Reads are open because every requester
    has to pick a facility to raise a ticket at all.
    """

    serializer_class = FacilitySerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = ConfigListPagination

    def get_queryset(self):
        qs = (
            Facility.objects.select_related("campus", "facility_type")
            .annotate(
                open_ticket_count=_ticket_count_subq(
                    Q(ticket__status__in=ACTIVE_STATUSES)
                ),
                resolved_ticket_count=_ticket_count_subq(Q(ticket__status="resolved")),
                closed_ticket_count=_ticket_count_subq(Q(ticket__status="closed")),
            )
            .order_by("campus", "name")
        )
        campus = self.request.query_params.get("campus")
        facility_type = self.request.query_params.get("facility_type")
        if campus:
            qs = qs.filter(campus_id=campus)
        if facility_type:
            qs = qs.filter(facility_type__code=facility_type)
        return qs
