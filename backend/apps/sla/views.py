"""The priority endpoint. Admin-writable policy, readable by anyone signed in."""

from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response

from apps.common.pagination import ConfigListPagination
from apps.common.roles import IsAdminOrReadOnly
from apps.sla.models import Priority
from apps.sla.serializers import PrioritySerializer
from apps.tickets.models import Ticket


class PriorityViewSet(viewsets.ModelViewSet):
    """The SLA policy. Admin-editable, but readable by anyone signed in.

    The HOS decides a ticket's real priority as they hand it out, so
    `AssignmentModal` fetches this list and admin-only reads would 403 it.
    Priorities are not sensitive, so `IsAdminOrReadOnly` is the whole rule.
    """

    queryset = Priority.objects.order_by("rank")
    serializer_class = PrioritySerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = ConfigListPagination

    def destroy(self, request, *args, **kwargs):
        """Refuse deletion of a priority still in use, with a reason.

        `Ticket.priority` is PROTECT, so the database already prevents this. Catching
        the ProtectedError is what turns a 500 into an answer an admin can act on.
        """
        priority = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            # Ticket.priority is related_name="+", so there is no reverse accessor.
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
