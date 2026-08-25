"""Single source of truth for resolving the caller's active role.

Reads the role from the JWT claim (the JWT claim is authoritative for the
request), with a DB fallback to the user's RoleAssignment for tests that use
`force_authenticate` and therefore have no token. Every view/analytic/report
must resolve role through here so behaviour does not diverge between code paths.
"""

# Roles that may act on someone else's ticket: assign it, change its status,
# delete an attachment they did not upload. Three modules independently typed
# this tuple out — tickets twice, analytics once — which is one edit away from
# a role that can act on a ticket in one view and not in another.
#
# `manager` is deliberately absent. A manager oversees all five campuses and
# has estate-wide read scope, but never touches ticket lifecycle: the work is
# held and moved by the HOS who staffs it. Adding them back here would make
# every campus's queue editable by one person with no trade knowledge of it.
TICKET_SUPERVISOR_ROLES = ("admin", "hod", "hos")

# Oversight without ticket authority — the manager's whole remit. Read scope
# and analytics across the estate, no lifecycle actions.
OVERSIGHT_ROLES = ("manager",)

# Who may read the supervising analytics endpoints: anyone who oversees other
# people's work, at any level. A technician is deliberately absent — they see
# their own queue, and `role_config` also refuses them `technician` as a
# group_by, so they are never ranked against peers by either route.
ANALYTICS_ROLES = TICKET_SUPERVISOR_ROLES + OVERSIGHT_ROLES

# Everyone who works tickets, as opposed to raising them. Staff actions
# (assign, claim, change status) are gated on this; "user" is deliberately
# absent even though a requester can see their own ticket, and so is "manager"
# for the reason given on TICKET_SUPERVISOR_ROLES.
STAFF_ROLES = TICKET_SUPERVISOR_ROLES + ("technician",)


def resolve_role(request):
    """Return the caller's active role string, or None.

    1. JWT claim `role` (works for both a SimpleJWT Token, which proxies `.get`
       to its payload, and a plain dict).
    2. Fallback: the user's RoleAssignment (force_authenticate in tests).
    """
    try:
        auth = getattr(request, "auth", None)
        role = auth.get("role") if auth else None
        if role:
            return role
    except Exception:
        pass

    user = getattr(request, "user", None)
    return getattr(user, "role", None) if user else None
