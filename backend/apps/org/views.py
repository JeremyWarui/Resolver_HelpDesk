"""
Campus and catalogue endpoints. Reference data, admin-writable.

Query params narrow a list, never widen it. The technician roster is the
exception to admin-writable, because a trade link grants ticket scope.
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, OuterRef, Subquery
from rest_framework import generics, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import RoleAssignment, TechnicianTrade
from apps.accounts.scope import visible_campuses
from apps.accounts.serializers import UserAdminSerializer
from apps.common.pagination import ConfigListPagination
from apps.common.roles import IsAdminGroup, IsAdminOrReadOnly, resolve_role
from apps.org.models import Campus, ServiceItem, SubSection
from apps.org.serializers import (
    CampusSerializer,
    ServiceItemSerializer,
    SubSectionSerializer,
)

User = get_user_model()


class CampusViewSet(viewsets.ModelViewSet):
    """Admin CRUD for campuses.

    A new campus is usable the moment it exists: trades are global and routing
    is (campus, trade), so there is nothing further to provision.
    """

    queryset = (
        Campus.objects.annotate(
            hos_id_annotated=Subquery(
                RoleAssignment.objects.filter(
                    role="hos", campus=OuterRef("pk")
                ).values("user_id")[:1]
            )
        )
        # People, not links: a technician working two trades here has two rows.
        .annotate(technician_count=Count("technician_trades__user", distinct=True))
        .order_by("name")
    )
    serializer_class = CampusSerializer
    permission_classes = [IsAdminGroup]
    pagination_class = ConfigListPagination


class SubSectionViewSet(viewsets.ModelViewSet):
    """Admin CRUD for trades."""

    serializer_class = SubSectionSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None  # plain list — the frontend does not unwrap this one

    def get_queryset(self):
        return SubSection.objects.prefetch_related("service_items").order_by("name")


class ServiceItemViewSet(viewsets.ModelViewSet):
    """Admin CRUD for service items."""

    serializer_class = ServiceItemSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = ConfigListPagination

    def get_queryset(self):
        """Narrow to one trade with `?sub_section=`."""
        qs = ServiceItem.objects.select_related("sub_section").order_by(
            "sub_section", "name"
        )
        sub_section_id = self.request.query_params.get("sub_section")
        if sub_section_id:
            qs = qs.filter(sub_section_id=sub_section_id)
        return qs


class CatalogTreeView(generics.ListAPIView):
    """The active trades and their service items, for the ticket create wizard.

    Trades are global, so this does not vary by campus and any authenticated
    user may call it.
    """

    serializer_class = SubSectionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ConfigListPagination

    def get_queryset(self):
        return (
            SubSection.objects.filter(is_active=True)
            .prefetch_related("service_items")
            .order_by("name")
        )


class ScopedTechnicianRosterView(APIView):
    """GET /technicians/ — the technicians in the caller's scope, and their trades.

    `?campus=` and `?sub_section=` narrow it, which is what the assignment
    modal sends: a caller assigning a ticket must pass the trade, or an HOS can
    give a Plumbing job to a carpenter, who then gets a 403 on their own ticket.

    Unlike a ticket-derived list this includes idle technicians. Scope comes
    from the JWT role and fails closed, and the two params narrow what scope
    already returned.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = resolve_role(request)
        links = TechnicianTrade.objects.filter(
            campus__in=visible_campuses(request.user, role)
        )
        if campus_id := request.query_params.get("campus"):
            links = links.filter(campus_id=campus_id)
        if sub_section_id := request.query_params.get("sub_section"):
            links = links.filter(sub_section_id=sub_section_id)
        links = links.select_related("sub_section").order_by("sub_section__name")

        trades = {}
        for link in links:
            ids, names = trades.setdefault(link.user_id, ([], []))
            if link.sub_section_id not in ids:
                ids.append(link.sub_section_id)
                names.append(link.sub_section.name)

        # One query for the roster; serializing `link.user` would re-walk it per link.
        users = User.objects.filter(pk__in=list(trades)).select_related(
            "campus", "role_assignment__campus"
        )
        rows = UserAdminSerializer(users, many=True).data
        for row in rows:
            row["sub_section_ids"], row["sub_section_names"] = trades[row["id"]]

        return Response(sorted(rows, key=lambda row: row["full_name"].lower()))
