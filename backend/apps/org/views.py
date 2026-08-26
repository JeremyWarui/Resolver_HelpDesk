"""Org-tree and catalogue endpoints. Reference data, admin-writable.

Used by:
    org.urls  CampusDepartmentViewSet, CampusViewSet, CatalogTreeView, DepartmentViewSet, …
"""

from django.contrib.auth import get_user_model
from rest_framework import generics, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Count, Prefetch

from apps.common.pagination import ConfigListPagination
from apps.common.roles import IsAdminGroup, IsAdminOrReadOnly
from apps.common.roles import resolve_role
from apps.accounts.scope import visible_sections
from apps.org.models import (
    Campus,
    CampusDepartment,
    Department,
    Section,
    SectionTechnician,
    SectionType,
    ServiceItem,
    SubSection,
)
from apps.org.serializers import (
    CampusDepartmentSerializer,
    CampusSerializer,
    DepartmentSerializer,
    SectionSerializer,
    SectionTechnicianSerializer,
    SectionTypeSerializer,
    SectionTypeWithSubSectionsSerializer,
    ServiceItemSerializer,
    SubSectionSerializer,
)
from apps.accounts.serializers import UserAdminSerializer, UserMinSerializer

User = get_user_model()


class CampusViewSet(viewsets.ModelViewSet):
    queryset = Campus.objects.all().order_by("name")
    serializer_class = CampusSerializer
    permission_classes = [IsAdminGroup]
    pagination_class = ConfigListPagination


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.select_related("manager_user").prefetch_related(
        "campus_departments__campus",
        "campus_departments__head_of_department",
    ).order_by("name")
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = ConfigListPagination

    def get_queryset(self):
        qs = super().get_queryset()
        campus_id = self.request.query_params.get("campus")
        if campus_id:
            qs = qs.filter(campus_departments__campus_id=campus_id)
        return qs


class SectionTypeViewSet(viewsets.ModelViewSet):
    """Admin CRUD for section types.
    List/retrieve return the richer SectionTypeWithSubSectionsSerializer so the
    requester QuickActions widget can render the service catalogue without a
    second round-trip."""

    # Prefetch() rather than a plain string, because the serializer renders
    # only the active rows in name order: express that here, once, and the
    # nested read costs two extra queries total instead of two per row.
    queryset = (
        SectionType.objects.select_related("department")
        .prefetch_related(
            Prefetch(
                "sub_sections",
                queryset=SubSection.objects.filter(is_active=True)
                .order_by("name")
                .prefetch_related(
                    Prefetch(
                        "service_items",
                        queryset=ServiceItem.objects.filter(is_active=True).order_by(
                            "name"
                        ),
                    )
                ),
            )
        )
        .order_by("department", "name")
    )
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = ConfigListPagination

    def get_serializer_class(self):
        if self.action in ("list", "retrieve"):
            return SectionTypeWithSubSectionsSerializer
        return SectionTypeSerializer


class SubSectionViewSet(viewsets.ModelViewSet):
    """Admin CRUD for sub-sections (trades). ?section_type=<id> scopes the list."""

    serializer_class = SubSectionSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None  # plain list — the frontend does not unwrap this one

    def get_queryset(self):
        qs = (
            SubSection.objects.select_related("section_type__department")
            .prefetch_related("service_items")
            .order_by("section_type", "name")
        )
        section_type_id = self.request.query_params.get("section_type")
        if section_type_id:
            qs = qs.filter(section_type_id=section_type_id)
        return qs


class ServiceItemViewSet(viewsets.ModelViewSet):
    """Admin CRUD for service items. ?sub_section=<id> scopes the list."""

    serializer_class = ServiceItemSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = ConfigListPagination

    def get_queryset(self):
        qs = ServiceItem.objects.select_related(
            "sub_section__section_type"
        ).order_by("sub_section", "name")
        sub_section_id = self.request.query_params.get("sub_section")
        if sub_section_id:
            qs = qs.filter(sub_section_id=sub_section_id)
        return qs


class CatalogTreeView(generics.ListAPIView):
    """GET /catalog/?campus=<id> — sub-sections served at that campus, items nested.

    Any authenticated user may call this; it drives the ticket create wizard.
    `campus` is required and returns 400 when missing.
    """

    serializer_class = SubSectionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ConfigListPagination

    def get_queryset(self):
        campus_id = self.request.query_params.get("campus")
        if not campus_id:
            return SubSection.objects.none()
        return SubSection.objects.visible_at(campus_id)

    def list(self, request, *args, **kwargs):
        if not request.query_params.get("campus"):
            return Response(
                {"detail": "campus query parameter is required."},
                status=400,
            )
        return super().list(request, *args, **kwargs)


class CampusDepartmentViewSet(viewsets.ModelViewSet):
    queryset = CampusDepartment.objects.select_related(
        "campus", "department", "head_of_department"
    ).order_by("campus", "department")
    serializer_class = CampusDepartmentSerializer
    permission_classes = [IsAdminGroup]
    pagination_class = ConfigListPagination

    # No assign-hod action: `head_of_department` is written by
    # `accounts.posts.assign_role` and by nothing else, so that it cannot drift
    # from the RoleAssignment the same person's dashboard and JWT read.


class SectionViewSet(viewsets.ModelViewSet):
    queryset = (
        Section.objects.select_related(
            "campus_department__campus",
            "campus_department__department",
            "section_type",
            "hos",
        )
        # People, not assignments. `distinct=True` on the link rows dedupes
        # links, which are already unique — a technician working two trades in
        # one section has two links and was counted twice, so Nairobi reported
        # 7 technicians while listing 6 names.
        .annotate(technician_count=Count("technician_links__user", distinct=True))
        .order_by(
            "campus_department__campus__name",
            "campus_department__department__name",
            "section_type__name",
        )
    )
    serializer_class = SectionSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = ConfigListPagination

    def get_queryset(self):
        qs = super().get_queryset()
        department_id = self.request.query_params.get("department")
        campus_id = self.request.query_params.get("campus")
        if department_id:
            qs = qs.filter(campus_department__department_id=department_id)
        if campus_id:
            qs = qs.filter(campus_department__campus_id=campus_id)
        return qs


class SectionTechnicianViewSet(viewsets.ReadOnlyModelViewSet):
    """Nested under /sections/<section_pk>/technicians/ — read only.

    A link row grants real ticket scope, so writing one is assigning a role:
    `accounts.posts.assign_role` creates these alongside the RoleAssignment and
    clears them on any rewrite. A link created here would have been wiped by the
    next role edit, and until then would have given someone whose role says
    `user` a technician's reach.
    """

    serializer_class = SectionTechnicianSerializer
    permission_classes = [IsAdminGroup]
    pagination_class = ConfigListPagination

    def get_queryset(self):
        qs = SectionTechnician.objects.select_related("user", "section", "sub_section")
        section_pk = self.kwargs.get("section_pk")
        if section_pk:
            qs = qs.filter(section_id=section_pk)
        sub_section_id = self.request.query_params.get("sub_section")
        if sub_section_id:
            qs = qs.filter(sub_section_id=sub_section_id)
        return qs.order_by("section", "sub_section", "user")


class ScopedTechnicianRosterView(APIView):
    """Technician roster for the caller's scope.

    Returns the technicians linked (via ``SectionTechnician``) to the sections
    the caller manages — admin = all, manager = department, hod = campus
    department, hos = their section(s), technician = own sections. Unlike the
    ticket-derived analytics list, this includes idle technicians. Scope is
    derived server-side from the JWT role via ``accounts.scope.visible_sections``
    (fail-closed).

    The person and their role are rendered by ``UserAdminSerializer``, not
    rebuilt here: campus and department come from the role, not from the link
    rows. The links contribute the one thing only they know, which is the set
    of trades the technician works.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = resolve_role(request)
        links = (
            SectionTechnician.objects.filter(
                section__in=visible_sections(request.user, role)
            )
            .select_related("sub_section")
            .order_by("sub_section__name")
        )

        # A technician working several trades in one section, or the same trade
        # at two campuses, yields several links — one row each way, listed once.
        trades = {}
        for link in links:
            ids, names = trades.setdefault(link.user_id, ([], []))
            if link.sub_section_id not in ids:
                ids.append(link.sub_section_id)
                names.append(link.sub_section.name)

        # One query for every person on the roster. Serializing `link.user` row
        # by row would re-walk this chain per link instead.
        users = User.objects.filter(pk__in=list(trades)).select_related(
            "profile__campus",
            "role_assignment__section__campus_department__campus",
            "role_assignment__section__campus_department__department",
        )
        rows = UserAdminSerializer(users, many=True).data
        for row in rows:
            row["sub_section_ids"], row["sub_section_names"] = trades[row["id"]]

        return Response(sorted(rows, key=lambda row: row["full_name"].lower()))


class SectionAssignableTechniciansView(APIView):
    """Lightweight read-only list of users assignable to tickets in a section.

    Returns User objects keyed by user.id — not SectionTechnician link records.
    Accessible to any authenticated user so HOS/technician roles can use the
    assignment modal.

    `?sub_section=<id>` narrows to technicians who work that trade, and callers
    assigning a ticket must pass it. Without it a HOS sees every technician in
    the section and can assign a Plumbing ticket to a carpenter, who then gets a
    403 on their own ticket — the dropdown has to agree with `scoped_ticket_qs`.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, section_pk):
        links = SectionTechnician.objects.filter(section_id=section_pk)
        sub_section_id = request.query_params.get("sub_section")
        if sub_section_id:
            links = links.filter(sub_section_id=sub_section_id)
        links = links.select_related("user").order_by(
            "user__first_name", "user__last_name", "user__username"
        )
        # One row per user: a technician working two trades in this section has
        # two links but must appear once in the dropdown.
        users = {}
        for link in links:
            users.setdefault(link.user_id, link.user)
        return Response(UserMinSerializer(list(users.values()), many=True).data)
