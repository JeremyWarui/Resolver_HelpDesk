from django.db.models import Exists, OuterRef


def ticket_base_qs():
    """The one Ticket queryset every read starts from.

    Carries the relations `TicketReadSerializer` touches and the `has_feedback`
    annotation it prefers. Both the scoped list and the detail view build on
    this, so a relation added to the serializer is added here once — a second
    hand-written copy is how `sub_section` went missing from detail reads and
    cost a query per request.
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
        "service_item__sub_section",
        "assigned_to",
        "raised_by",
        "requester_campus",
        "location__facility_type",
        "location__facility",
    )


def scoped_ticket_qs(user, role):
    """Return a Ticket queryset scoped to what `user` can see for the given `role`.

    Returns an empty queryset for users with no role or an unknown role.
    ?mine=1 is the `role="user"` branch — the view passes that literal rather
    than rebuilding the queryset, so there is only ever one base to maintain.
    """
    from apps.org.models import SectionTechnician

    base = ticket_base_qs().order_by("-updated_at")

    if role == "admin":
        return base

    if role == "manager":
        # Manager sees all tickets in their department across all campuses.
        return base.filter(section__campus_department__department__manager_user=user)

    if role == "hod":
        # HOD sees their campus's department — one campus, every trade.
        return base.filter(section__campus_department__head_of_department=user)

    if role == "hos":
        # HOS sees their section — one campus, every trade under it.
        return base.filter(section__hos=user)

    if role == "technician":
        # Technician scope is two-dimensional: campus AND trade. `section`
        # already carries the campus (NRB-ADM-MAINT and MSA-ADM-MAINT are
        # distinct rows), so one SectionTechnician row pins both axes.
        #
        # This must match PAIRWISE. Filtering on two independent __in lookups
        # would take the cross product: a technician who is Carpentry@Nairobi
        # and Plumbing@Mombasa would also match Plumbing@Nairobi and
        # Carpentry@Mombasa — two pairs they were never assigned. The two forms
        # agree for anyone assigned at a single campus, which is exactly why
        # that bug would survive casual testing.
        link = SectionTechnician.objects.filter(
            user=user,
            section_id=OuterRef("section_id"),
            sub_section_id=OuterRef("sub_section_id"),
        )
        return base.filter(Exists(link))

    if role == "user":
        # Requester (universal): own tickets only.
        return base.filter(raised_by=user)

    return base.none()


def scoped_section_qs(user, role):
    """Return a Section queryset scoped to what `user` manages for the given `role`.

    Mirrors the section traversal in ``scoped_ticket_qs`` so technician rosters
    and section pickers stay consistent with ticket scope. Fail-closed: returns
    an empty queryset for users with no role or an unknown role.

    Note this is deliberately section-granular even for technicians: a
    technician's *sections* are the campuses they work at, and the sub-section
    narrowing happens on tickets. Anything that lists technicians per trade must
    filter ``SectionTechnician`` itself rather than lean on this.
    """
    from apps.org.models import Section, SectionTechnician

    base = Section.objects.select_related(
        "campus_department__department",
        "campus_department__campus",
        "section_type",
    )

    if role == "admin":
        return base

    if role == "manager":
        return base.filter(campus_department__department__manager_user=user)

    if role == "hod":
        return base.filter(campus_department__head_of_department=user)

    if role == "hos":
        return base.filter(hos=user)

    if role == "technician":
        section_ids = SectionTechnician.objects.filter(user=user).values_list(
            "section_id", flat=True
        )
        return base.filter(pk__in=section_ids)

    return Section.objects.none()
