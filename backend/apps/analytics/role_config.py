"""Per-role analytics configuration — the single source of truth that makes
KPIs scope-invariant (SoT §5.4).

The metric engine (`aggregate()` + `insights.py`) is identical for every role;
only three things vary by role and they all live here:

  * scope          — applied server-side via scoped_ticket_qs(user, role)
  * default_group_by + allowed_group_by — the comparison dimension(s)
  * insights       — which prescriptive computations the role is served

Those three are what the code reads, so those three are what is here. Keys
describing what a role "may see" used to sit alongside them, unread by anything
— the frontend keeps its own copy of that shape — and config that documents an
intention nobody enforces is worse than no config at all.

The absence of "technician" from a technician's allowed_group_by is what
prevents them from seeing peer rankings; `resolve_group_by` enforces it.
"""

# Dimensions the analytics engine can group by. Backend validates a requested
# group_by against the role's allowed list and falls back to default_group_by.
GROUP_BY_DIMENSIONS = (
    "time",
    "status",
    "section",
    "campus",
    "campus_department",
    "sub_section",
    "service_item",
    "priority",
    "facility_type",
    "facility",
    "technician",
    # Why work is stopped. Only populated on paused tickets, so a breakdown on
    # it answers a different question from the others: not "where is the work"
    # but "what is in the way of it".
    "pending_reason",
)

# Insight types (implemented in apps/analytics/insights.py).
ROLE_VIEWS = {
    "admin": {
        # Campus, not department: there is one department, so grouping by it
        # would put every ticket in a single bar.
        "default_group_by": "campus",
        "allowed_group_by": [
            "campus",
            "campus_department",
            "section",
            "sub_section",
            "service_item",
            "priority",
            "facility_type",
            "facility",
            "pending_reason",
        ],
        "insights": [
            "bottleneck",
            "sla_leak",
            "recurring_fault",
            "capacity",
            "csat_driver",
        ],
    },
    "manager": {
        "default_group_by": "campus",
        "allowed_group_by": [
            "campus",
            "sub_section",
            "service_item",
            "priority",
            "facility",
            "pending_reason",
        ],
        # `recurring_fault` belongs here most of all: "this item at this
        # building was raised five times — fix it properly rather than patching
        # it again" is a capital-works decision, and the manager is the only
        # role that can authorise one. The HOS and HOD had it and the director
        # did not, so the insight reached everyone except the person who could
        # act on it.
        "insights": ["bottleneck", "sla_leak", "capacity", "recurring_fault"],
    },
    "hod": {
        # An HOD has exactly one Maintenance section, so the useful split
        # within their campus is the trade.
        "default_group_by": "sub_section",
        "allowed_group_by": [
            "sub_section",
            "service_item",
            "priority",
            "facility",
            "technician",
            "pending_reason",
        ],
        "insights": ["bottleneck", "recurring_fault", "sla_leak"],
    },
    "hos": {
        "default_group_by": "technician",
        "allowed_group_by": [
            "technician",
            "sub_section",
            "service_item",
            "priority",
            "facility",
            "pending_reason",
        ],
        "insights": ["bottleneck", "recurring_fault", "sla_leak"],
    },
    "technician": {
        # Trend-only: compares the technician to their own past, never to peers.
        "default_group_by": "time",
        "allowed_group_by": ["time", "status"],
        "insights": [],
    },
    "user": {
        "default_group_by": "status",
        "allowed_group_by": ["status", "time"],
        "insights": [],
    },
}


def get_role_config(role):
    """Return the config for `role`, or the locked-down requester default."""
    return ROLE_VIEWS.get(role, ROLE_VIEWS["user"])


def resolve_group_by(role, requested):
    """Pick a safe group_by: the requested one if the role is allowed it,
    otherwise the role default. Fails closed (never widens what a role sees)."""
    cfg = get_role_config(role)
    if requested and requested in cfg["allowed_group_by"]:
        return requested
    return cfg["default_group_by"]
