"""The Ticket querysets every read starts from, narrowed by role.

Scope derives server-side from the JWT role claim, never from client
params, and fails closed: a role with no rule sees nothing.
"""

from django.db.models import Exists, OuterRef

from apps.accounts.models import TechnicianTrade
from apps.accounts.scope import role_holds_campus


def ticket_base_qs():
    """The one Ticket queryset every read starts from.

    Carries the relations `TicketReadSerializer` touches. A second copy
    elsewhere costs a query per row.
    """
    from apps.tickets.models import Ticket

    return Ticket.objects.select_related(
        "trade",
        "priority",
        "service_item",
        "assigned_to",
        "raised_by",
        "requester_campus",
        "facility__facility_type",
    )


def scoped_ticket_qs(user, role):
    """Return a Ticket queryset scoped to what `user` can see for the given `role`.

    Four shapes, and they fail closed. An admin and a manager read every
    campus; an HOS and an HOD read their own; a technician reads the
    (campus, trade) pairs they hold; everyone else reads what they raised.
    """
    base = ticket_base_qs().order_by("-updated_at")

    if role in ("admin", "manager"):
        return base

    if role == "user":
        return base.filter(raised_by=user)

    if role == "technician":
        # Pairwise, never the cross product: two `__in` lookups would also match
        # Carpentry@Nairobi + Plumbing@Mombasa against pairs nobody assigned.
        return base.filter(
            Exists(
                TechnicianTrade.objects.filter(
                    user=user,
                    campus_id=OuterRef("requester_campus_id"),
                    trade_id=OuterRef("trade_id"),
                )
            )
        )

    if role in ("hos", "hod"):
        return base.filter(role_holds_campus(user, role, prefix="requester_campus_id"))

    return base.none()
