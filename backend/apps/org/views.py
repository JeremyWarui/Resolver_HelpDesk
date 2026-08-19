from rest_framework import generics, serializers as drf_serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Count, Prefetch

from apps.common.pagination import ConfigListPagination
from apps.common.permissions import IsAdminGroup, IsAdminOrReadOnly
from apps.common.roles import resolve_role
from apps.tickets.services.scope import scoped_section_qs
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
from apps.org.services.visibility import get_visible_sub_sections
from apps.accounts.identity import display_name


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
        return get_visible_sub_sections(campus_id)

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

    @action(detail=True, methods=["get"], url_path="hod-candidates")
    def hod_candidates(self, request, pk=None):
        """Users who have an active HOD role assignment for this campus-department."""
        from django.contrib.auth import get_user_model
        cd = self.get_object()
        User = get_user_model()
        users = User.objects.filter(
            role_assignment__role="hod",
            role_assignment__campus_department=cd,
        ).order_by("last_name", "first_name")

        data = [
            {
                "id": u.id,
                "name": display_name(u),
                "username": u.username,
            }
            for u in users
        ]
        return Response(data)

    @action(detail=True, methods=["patch"], url_path="assign-hod")
    def assign_hod(self, request, pk=None):
        """Set or clear the head_of_department for this campus-department."""
        from django.contrib.auth import get_user_model

        cd = self.get_object()
        hod_id = request.data.get("hod_id")

        if hod_id is None:
            cd.head_of_department = None
        else:
            User = get_user_model()
            try:
                cd.head_of_department = User.objects.get(pk=hod_id)
            except User.DoesNotExist:
                raise drf_serializers.ValidationError({"hod_id": "User not found."})

        cd.save(update_fields=["head_of_department"])
        return Response(CampusDepartmentSerializer(cd).data)


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


class SectionTechnicianViewSet(viewsets.ModelViewSet):
    """Nested under /sections/<section_pk>/technicians/."""

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

    def perform_create(self, serializer):
        section_pk = self.kwargs.get("section_pk")
        if section_pk:
            serializer.save(section_id=section_pk)
        else:
            serializer.save()


class ScopedTechnicianRosterView(APIView):
    """Technician roster for the caller's scope.

    Returns the technicians assigned (via ``SectionTechnician``) to the sections
    the caller manages — admin = all, manager = department, hod = campus
    department, hos = their section(s), technician = own sections. Unlike the
    ticket-derived analytics list, this includes idle technicians. Scope is
    derived server-side from the JWT role via ``scoped_section_qs`` (fail-closed).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = resolve_role(request)
        sections = scoped_section_qs(request.user, role)
        links = (
            SectionTechnician.objects.filter(section__in=sections)
            .select_related(
                "user",
                "sub_section",
                "section__section_type",
                "section__campus_department__campus",
                "section__campus_department__department",
            )
            .order_by("user__first_name", "user__last_name")
        )

        techs = {}
        for link in links:
            u = link.user
            entry = techs.get(u.id)
            if entry is None:
                full = display_name(u)
                entry = techs[u.id] = {
                    "id": u.id,
                    "username": u.username,
                    "first_name": u.first_name,
                    "last_name": u.last_name,
                    "name": full,
                    "email": u.email,
                    "role": "technician",
                    "sections": [],
                    "section_names": [],
                    "sub_sections": [],
                    "sub_section_names": [],
                    "campus_name": None,
                    "primary_campus_id": None,
                    "primary_department_id": None,
                    "primary_department_name": None,
                }
            sec = link.section
            # A technician working several trades in one section yields several
            # links — keep each list distinct.
            if sec.id not in entry["sections"]:
                entry["sections"].append(sec.id)
            stype = sec.section_type.name if sec.section_type_id else None
            if stype and stype not in entry["section_names"]:
                entry["section_names"].append(stype)
            if link.sub_section_id not in entry["sub_sections"]:
                entry["sub_sections"].append(link.sub_section_id)
                entry["sub_section_names"].append(link.sub_section.name)
            # First section establishes the technician's primary campus/department.
            if entry["campus_name"] is None:
                cd = sec.campus_department
                campus = cd.campus
                dept = cd.department
                entry["campus_name"] = campus.name
                entry["primary_campus_id"] = campus.id
                entry["primary_department_id"] = dept.id
                entry["primary_department_name"] = dept.name

        return Response(sorted(techs.values(), key=lambda t: t["name"].lower()))


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
        data = {}
        for link in links:
            data.setdefault(
                link.user_id,
                {
                    "id": link.user.id,
                    "username": link.user.username,
                    "first_name": link.user.first_name,
                    "last_name": link.user.last_name,
                },
            )
        return Response(list(data.values()))
