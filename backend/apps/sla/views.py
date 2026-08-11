from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.pagination import ConfigListPagination
from apps.common.permissions import IsAdminGroup
from apps.sla.models import EscalationRule, Priority
from apps.sla.serializers import EscalationRuleSerializer, PrioritySerializer
from apps.tickets.models import Ticket


class PriorityViewSet(viewsets.ModelViewSet):
    """The SLA policy. Admin-editable, but readable by anyone signed in.

    Reading was admin-only, and that quietly broke assignment: the HOS decides a
    ticket's real priority as they hand it out, so `AssignmentModal` fetches this
    list — and got a 403. The request failed silently, the choices fell back to
    an empty array, and the modal rendered the "Priority" heading and its hint
    above no buttons at all. The control looked present in the code and did not
    exist on screen.

    Priorities are not sensitive (Low/Medium/High/Critical and their SLA
    windows); the same split as `FacilityViewSet` applies — read for everyone,
    write for admins.
    """

    queryset = Priority.objects.prefetch_related("escalation_rules").order_by("rank")
    serializer_class = PrioritySerializer
    pagination_class = ConfigListPagination

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdminGroup()]

    def destroy(self, request, *args, **kwargs):
        """Refuse deletion of a priority still in use, with a reason.

        `Ticket.priority` is PROTECT, so the database already prevents this —
        but the ProtectedError escaped as a 500, which reads to an admin as "the
        app is broken" rather than "this one is in use". Same protection, an
        answer they can act on.
        """
        priority = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            # Ticket.priority carries related_name="+", so there is no reverse
            # accessor to count through — query the tickets directly.
            in_use = Ticket.objects.filter(priority=priority).count()
            return Response(
                {
                    "detail": (
                        f"{priority.name} is used by {in_use} "
                        f"ticket{'s' if in_use != 1 else ''} and cannot be deleted. "
                        "Priorities are referenced by tickets for the life of the "
                        "record, so retire it by leaving it unused instead."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )


class EscalationRuleViewSet(viewsets.ModelViewSet):
    """Nested under /priorities/<priority_pk>/escalation-rules/."""

    serializer_class = EscalationRuleSerializer
    permission_classes = [IsAdminGroup]
    pagination_class = ConfigListPagination

    def get_queryset(self):
        qs = EscalationRule.objects.select_related("priority")
        priority_pk = self.kwargs.get("priority_pk")
        if priority_pk:
            qs = qs.filter(priority_id=priority_pk)
        return qs.order_by("priority", "order")

    def perform_create(self, serializer):
        priority_pk = self.kwargs.get("priority_pk")
        if priority_pk:
            serializer.save(priority_id=priority_pk)
        else:
            serializer.save()
