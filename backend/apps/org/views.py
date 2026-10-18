"""
Campus and catalogue endpoints, admin-writable.

Query params narrow a list, never widen it. Structure only: who staffs a
campus is a post, and `accounts.CampusRosterView` answers that. Nothing here
reads a user, so `org` depends on no other app.
"""

from django.db.models import Prefetch, ProtectedError
from rest_framework import generics, mixins, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.roles import IsAdminOrManagerReadOnly, IsAdminOrReadOnly
from apps.org.models import Campus, ServiceItem, Trade
from apps.org.serializers import (
    CampusSerializer,
    ServiceItemSerializer,
    TradeSerializer,
)


class CampusViewSet(viewsets.ModelViewSet):
    """A new campus is usable the moment it exists: trades are global and
    routing is (campus, trade), so there is nothing further to provision.
    """

    queryset = Campus.objects.order_by("name")
    serializer_class = CampusSerializer
    permission_classes = [IsAdminOrManagerReadOnly]


class RetireInsteadOfDelete:
    """A 409 for a row tickets point at: `Ticket.service_item` is PROTECT."""

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Tickets have been raised against it. Retire it instead."},
                status=409,
            )


class TradeViewSet(RetireInsteadOfDelete, viewsets.ModelViewSet):
    serializer_class = TradeSerializer
    permission_classes = [IsAdminOrReadOnly]
    # A bare list, not a page: five trades exist and the set is fixed.
    pagination_class = None

    def get_queryset(self):
        return Trade.objects.prefetch_related("service_items").order_by("name")


class ServiceItemViewSet(
    RetireInsteadOfDelete,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Admin writes to service items. They are read through `/catalog/` and `/trades/`."""

    serializer_class = ServiceItemSerializer
    permission_classes = [IsAdminOrReadOnly]
    queryset = ServiceItem.objects.all()


class CatalogTreeView(generics.ListAPIView):
    """What the ticket wizard may offer: active trades and their active items.

    `Ticket.service_item` is PROTECTed, so retiring is the only way to remove
    one. The admin lists stay unfiltered, or a retired row could never return.
    """

    serializer_class = TradeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Trade.objects.filter(is_active=True)
            .prefetch_related(
                Prefetch(
                    "service_items",
                    queryset=ServiceItem.objects.filter(is_active=True),
                )
            )
            .order_by("name")
        )
