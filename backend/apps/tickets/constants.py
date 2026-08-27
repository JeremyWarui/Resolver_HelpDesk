"""The ticket vocabulary: statuses, escalation levels, and hold reasons.

The single definition of each. `Ticket.status` and `Ticket.current_level` take
their choices from here rather than restating the list beside the column.
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
