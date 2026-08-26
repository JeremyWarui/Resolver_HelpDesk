"""The Ticket querysets every read starts from, narrowed by role.

Scope derives server-side from the JWT role claim, never from client
params, and fails closed: a role with no rule sees nothing.

Used by:
    analytics.report_views  scoped_ticket_qs
    analytics.views         scoped_ticket_qs
    tickets.views           scoped_ticket_qs, ticket_base_qs
"""

from django.db.models import Exists, OuterRef

from apps.accounts.scope import section_path, technician_pair_exists


def ticket_base_qs():
    """The one Ticket queryset every read starts from.

    Carries the relations `TicketReadSerializer` touches and the `has_feedback`
    annotation it prefers. Both the scoped list and the detail view build on
    this, so a relation added to the serializer is added here once. A second
    copy elsewhere costs a query per row.
    """
    from apps.tickets.models import Ticket, TicketFeedback

    return Ticket.objects.annotate(
        # A flag, not a join: the rating itself is detail-only, but a list has
        # to be able to say which resolved tickets are still waiting on their
        # requester. Exists() keeps this a subquery, so it cannot fan the rows
        # out the way a join to a related table would.
        has_feedback=Exists(TicketFeedback.objects.filter(ticket=OuterRef("pk"))),
    ).select_related(
        "section__campus_department__department",
        "section__campus_department__campus",
        "section__section_type",
        "sub_section",
        "priority",
        "service_item",
        "assigned_to",
        "raised_by",
        "requester_campus",
        "location__facility_type",
        "location__facility",
    )


def scoped_ticket_qs(user, role):
    """Return a Ticket queryset scoped to what `user` can see for the given `role`.

    The role→org traversal is `accounts.scope`'s declaration, not a copy of it.
    Fail-closed: a role with no path there sees nothing.

    ?mine=1 is the `role="user"` branch — the view passes that literal rather
    than rebuilding the queryset, so there is only ever one base to maintain.
    """
    base = ticket_base_qs().order_by("-updated_at")

    if role == "admin":
        return base

    if role == "user":
        return base.filter(raised_by=user)

    if role == "technician":
        # Two-dimensional (campus AND trade), so a subquery rather than a path.
        return base.filter(technician_pair_exists(user))

    path = section_path(role, prefix="section")
    if path is None:
        return base.none()
    return base.filter(**{path: user})
