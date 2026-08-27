"""
The only place a role changes what analytics does.

The figures are identical for everyone; what varies is the dimension the
comparison is drawn on. What a role's list omits is what it cannot be shown
about other people.
"""

GROUP_BY_DIMENSIONS = ("sub_section", "facility", "technician", "status", "campus")

# Campus, not section: one Maintenance section per campus draws the same chart.
ROLE_GROUP_BY = {
    "admin": ("campus", GROUP_BY_DIMENSIONS),
    "manager": ("campus", GROUP_BY_DIMENSIONS),
    "hod": ("sub_section", ("sub_section", "facility", "technician", "status")),
    "hos": ("technician", ("sub_section", "facility", "technician", "status")),
    "technician": ("status", ("status", "sub_section")),
    "user": ("status", ("status",)),
}


def resolve_group_by(role, requested):
    """Return the requested dimension if the role is allowed it, else its default.

    Fails closed: an unknown role gets the requester's list, and a disallowed
    request silently becomes the default rather than an error, so a stale
    client cannot widen what a role is compared against.
    """
    default, allowed = ROLE_GROUP_BY.get(role, ROLE_GROUP_BY["user"])
    return requested if requested in allowed else default
