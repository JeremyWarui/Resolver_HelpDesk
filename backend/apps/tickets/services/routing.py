from apps.org.models import Section


class ServiceNotAvailableError(Exception):
    pass


def resolve_routing(requester_campus_id, service_item):
    """Return the Section that handles `service_item` at `requester_campus_id`.

    The service item names a sub-section, the sub-section names a section type,
    and the section is that type's instance at the requester's campus. Routing
    is therefore fully determined by the one choice the requester makes.

    Raises ServiceNotAvailableError if no active section handles the service at
    the campus — e.g. a campus that runs no Maintenance section at all.
    """
    section = (
        Section.objects.filter(
            campus_department__campus_id=requester_campus_id,
            section_type_id=service_item.sub_section.section_type_id,
            is_active=True,
        )
        .select_related(
            "campus_department__head_of_department",
            "campus_department__campus",
            "hos",
            "section_type",
        )
        # (campus_department, section_type) is unique and a campus has one
        # Administration department, so this matches at most one row. Ordered
        # anyway so the result can never depend on insertion order.
        .order_by("pk")
        .first()
    )
    if section is None:
        raise ServiceNotAvailableError(
            "No active section handles this service at the requester's campus."
        )
    return section
