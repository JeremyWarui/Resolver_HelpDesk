from apps.org.models import SubSection


def get_visible_sub_sections(campus_id):
    """Return the sub-sections (trades) offered at `campus_id`.

    A trade is visible iff an active Section of its parent section_type exists
    in a CampusDepartment at that campus. Traversal:
        SubSection → SectionType → Section (is_active=True)
                   → CampusDepartment → campus_id

    Sub-sections are global, so this is what stops a campus that runs no
    masonry from offering masonry services in the ticket wizard.
    """
    return (
        SubSection.objects.filter(
            is_active=True,
            section_type__sections__is_active=True,
            section_type__sections__campus_department__campus_id=campus_id,
        )
        .select_related("section_type__department")
        .prefetch_related("service_items")
        .distinct()
        .order_by("section_type", "name")
    )
