"""The priority endpoint. Admin-editable policy, readable by anyone signed in."""

from rest_framework import mixins, viewsets

from apps.common.roles import IsAdminOrReadOnly
from apps.sla.models import Priority
from apps.sla.serializers import PrioritySerializer


class PriorityViewSet(mixins.UpdateModelMixin, viewsets.ReadOnlyModelViewSet):
    """The SLA policy: read, and edited by an admin. The set itself is fixed.

    Read and update only, because the four levels are a vocabulary rather than
    a table an admin fills in. Adding one is the dangerous half: a new lowest
    rank silently becomes `Priority.default()` and changes what every new
    ticket opens at, with nothing on any trail to say so. Deleting one is
    refused by `Ticket.priority`'s PROTECT regardless, since tickets reference
    a priority for the life of the record.

    Reads are open to anyone signed in: the HOS sets a ticket's real priority
    as they hand it out, so the assignment modal has to fetch this list.
    """

    queryset = Priority.objects.order_by("rank")
    serializer_class = PrioritySerializer
    permission_classes = [IsAdminOrReadOnly]
