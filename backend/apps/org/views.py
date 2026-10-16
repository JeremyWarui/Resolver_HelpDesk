"""
Campus and catalogue endpoints, admin-writable.

Query params narrow a list, never widen it. Structure only: who staffs a
campus is a post, and `accounts.CampusRosterView` answers that. Nothing here
reads a user, so `org` depends on no other app.
"""

from django.db.models import Prefetch
from rest_framework import generics, viewsets
from rest_framework.permissions import IsAuthenticated

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


class TradeViewSet(viewsets.ModelViewSet):
    serializer_class = TradeSerializer
    permission_classes = [IsAdminOrReadOnly]
    # A bare list, not a page: five trades exist and the set is fixed.
    pagination_class = None

    def get_queryset(self):
        return Trade.objects.prefetch_related("service_items").order_by("name")


class ServiceItemViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceItemSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        # No select_related: `order_by("trade")` joins org_trade for
        # Trade.Meta.ordering already, and the serializer renders the FK as id.
        qs = ServiceItem.objects.order_by("trade", "name")
        trade_id = self.request.query_params.get("trade")
        if trade_id:
            qs = qs.filter(trade_id=trade_id)
        return qs


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
