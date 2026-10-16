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
    """Return the tickets `user` may open, for the given `role`.

    Fails closed. An admin reads every campus; an HOS and an HOD read their
    own; a technician reads the (campus, trade) pairs they hold; a plain user
    reads what they raised. A manager opens no tickets here: they read the
    ticket list (`listed_ticket_qs`) and the figures (`reporting_ticket_qs`).
    """
    base = ticket_base_qs().order_by("-updated_at")

    if role == "admin":
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


def listed_ticket_qs(user, role):
    """The tickets a role's ticket table lists.

    The same as `scoped_ticket_qs`, except the manager, who sees every
    campus's rows without being able to open one.
    """
    if role == "manager":
        return ticket_base_qs().order_by("-updated_at")
    return scoped_ticket_qs(user, role)


def reporting_ticket_qs(user, role):
    """The tickets a role's figures and ratings are computed over.

    The manager's cover every campus. A technician's cover the jobs assigned
    to them, not their whole trade: the report is about their own work.
    """
    if role == "technician":
        return ticket_base_qs().order_by("-updated_at").filter(assigned_to=user)
    return listed_ticket_qs(user, role)
