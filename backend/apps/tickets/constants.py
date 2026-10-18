"""The ticket vocabulary: statuses, escalation levels, and hold reasons.

The single definition of each. `Ticket.status` and `Ticket.current_level` take
their choices from here.
"""

STATUSES = (
    ("open", "Open"),
    ("assigned", "Assigned"),
    ("in_progress", "In progress"),
    ("pending", "Pending"),
    ("resolved", "Resolved"),
    ("closed", "Closed"),
)

# Everything not finished. `pending` is in here: it is still open work.
ACTIVE_STATUSES = ("open", "assigned", "in_progress", "pending")

# Active *and* the SLA clock is moving. "Is this late?" uses this, not the above.
RUNNING_STATUSES = ("open", "assigned", "in_progress")

TERMINAL_STATUSES = ("resolved", "closed")

# When the requester may read the comments on their ticket: while it is held,
# so they can see why, and once it is resolved, so they can see what was done.
REQUESTER_COMMENT_STATUSES = ("pending", "resolved")

ALL_STATUSES = ACTIVE_STATUSES + TERMINAL_STATUSES

# Escalation is structural: technician to HOS to HOD, in that order.
LEVELS = (
    ("technician", "Technician"),
    ("hos", "HOS"),
    ("hod", "HOD"),
)

LEVEL_ORDER = {level: i for i, (level, _) in enumerate(LEVELS)}

ESCALATED_LEVELS = ("hos", "hod")


PENDING_REASONS = (
    ("material_not_in_store", "Material not in store"),
    ("awaiting_material_requested", "Awaiting material — request placed"),
    ("requester_unavailable", "Requestor was not available"),
    ("location_inaccessible", "Location/Room was not accessible"),
    ("additional_labour_required", "Additional labour required"),
    ("technical_assistance_required", "Technical assistance required"),
)

PENDING_REASON_CODES = tuple(code for code, _ in PENDING_REASONS)

PENDING_REASON_LABELS = dict(PENDING_REASONS)
