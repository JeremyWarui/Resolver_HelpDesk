"""Single source of truth for resolving the caller's active role.

Reads the role from the JWT claim (the JWT claim is authoritative for the
request), with a DB fallback to the user's RoleAssignment for tests that use
`force_authenticate` and therefore have no token. Every view/analytic/report
must resolve role through here so behaviour does not diverge between code paths.
"""

# Roles that oversee other people's work: they see a section, a campus or the
# whole estate rather than their own queue. Three modules independently typed
# this tuple out — tickets twice, analytics once — which is one edit away from
# a role that can act on a ticket in one view and not in another.
SUPERVISOR_ROLES = ("admin", "manager", "hod", "hos")

# Everyone who works tickets, as opposed to raising them. Staff actions
# (assign, claim, change status) are gated on this; "user" is deliberately
# absent even though a requester can see their own ticket.
STAFF_ROLES = SUPERVISOR_ROLES + ("technician",)


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
