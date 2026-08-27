"""
The only place a role changes what analytics does.

The figures are identical for everyone; what varies is the dimensions the
comparison is drawn on. What a role's list omits is what it cannot be shown
about other people.
"""

# Campus, not section: one Maintenance section per campus draws the same chart.
_SUPERVISOR = ("trade", "facility", "technician", "status")
_ORGANISATION = _SUPERVISOR + ("campus",)

# role -> (the dimensions it is shown by default, the dimensions it may ask for)
ROLE_GROUP_BY = {
    "admin": (("campus",), _ORGANISATION),
    "manager": (("campus",), _ORGANISATION),
    "hod": (("trade",), _SUPERVISOR),
    "hos": (("technician",), _SUPERVISOR),
    "technician": (("status",), ("status", "trade")),
    "user": (("status",), ("status",)),
}


def resolve_group_by(role, requested) -> list:
    """The dimensions to group by: what was asked for if the role may have it.

    Fails closed. An unknown role gets the requester's list, and a request the
    role is not served becomes the role's default rather than an error, so a
    stale client cannot widen what it is compared against. One disallowed half
    of a pair rejects the pair: a caller does not get half of what they asked
    for without being told. The same dimension twice is rejected the same way,
    rather than answered with a column repeated beside itself.
    """
    default, allowed = ROLE_GROUP_BY.get(role, ROLE_GROUP_BY["user"])
    asked = [name for name in (requested or "").split(",") if name]
    if 1 <= len(set(asked)) == len(asked) <= 2 and all(n in allowed for n in asked):
        return asked
    return list(default)
