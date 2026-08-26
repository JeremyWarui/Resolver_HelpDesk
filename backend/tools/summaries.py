"""One-line summaries for modules that carry no docstring yet.

Each is written from the module's own definitions, not from its comments.
"""

SUMMARIES = {
    "accounts.models": "The account, its campus placement, and the one role it holds.",
    "common.pagination": (
        "Page-size policies. Config lists and ticket feeds page by number; the\n"
        "append-only feeds use a cursor, which is stable while rows are inserted."
    ),
    "facilities.models": "The facility registry: a type, and the named places of that type at a campus.",
    "facilities.serializers": "Read and write shapes for the facility registry.",
    "facilities.validators": (
        "What a location of each facility type must state.\n\n"
        "`TYPE_SPECS` is the contract. It is mirrored in the frontend by\n"
        "`TicketCreationWizard.tsx::FACILITY_FORMS`; change both together."
    ),
    "facilities.views": "Facility and facility-type endpoints, with per-facility ticket counts.",
    "notifications.models": "One row per thing a user should be told about.",
    "notifications.views": "The notification feed, and marking rows read. Polled, never pushed.",
    "org.serializers": "Read and write shapes for the org tree and the service catalogue.",
    "org.views": "Org-tree and catalogue endpoints. Reference data, admin-writable.",
    "sla.escalation": (
        "Moving a ticket up a level when it has been open too long.\n\n"
        "Escalation is structural (technician to HOS to HOD), not configurable\n"
        "workflow. A vacant post is skipped and the ticket carries on upward."
    ),
    "sla.models": "Priority levels and the escalation thresholds hung off them.",
    "sla.serializers": "Read and write shapes for priorities and escalation rules.",
    "sla.views": "Priority and escalation-rule endpoints. Admin-writable policy.",
    "tickets.models": "The ticket and everything hung off it: location, log, comment, feedback, attachment.",
    "tickets.scope": (
        "The Ticket querysets every read starts from, narrowed by role.\n\n"
        "Scope derives server-side from the JWT role claim, never from client\n"
        "params, and fails closed: a role with no rule sees nothing."
    ),
    "tickets.serializers": "Read and write shapes for a ticket and its nested reference data.",
    "org.models": "The organisational tree, the trades hung off it, and the service catalogue.",
    "tickets.views": (
        "Ticket endpoints: the scoped list, the detail, and every action on one.\n\n"
        "A view never mutates a Ticket directly; it calls `tickets.lifecycle`.\n"
        "Every `/tickets/{pk}/...` action fetches through\n"
        "`get_ticket_for_request_or_403()`, never a bare `get_object_or_404`."
    ),
}
