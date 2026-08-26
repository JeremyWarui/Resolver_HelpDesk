"""The ticket vocabulary: statuses, escalation levels, and hold reasons.

Defined here because `tickets` owns the model that has the fields. Every other
app is a consumer.

Used by:
    tickets.models        PENDING_REASONS as field choices
    tickets.serializers   ALL_STATUSES, PENDING_REASON_CODES
    tickets.lifecycle     TERMINAL_STATUSES, PENDING_REASON_* , REASON_REQUIRING_NOTE
    tickets.views         PENDING_REASONS, status sets
    sla.clock             RUNNING_STATUSES, TERMINAL_STATUSES
    sla.escalation        ACTIVE_STATUSES, TERMINAL_STATUSES
    analytics.services    status sets, ESCALATED_LEVELS, PENDING_REASON_LABELS
    analytics.report_views  status sets
    facilities.views      ACTIVE_STATUSES
    common.admin          ACTIVE_STATUSES
    common.seed           TERMINAL_STATUSES, PENDING_REASON_LABELS
"""

# ── Statuses ──────────────────────────────────────────────────────────────────

# Everything not finished. `pending` is in here: a ticket waiting on parts is
# still open work somebody has to come back to.
ACTIVE_STATUSES = ("open", "assigned", "in_progress", "pending")

# Active *and* the SLA clock is moving. `pending` freezes the timer, so
# anything asking "is this late?" uses this, not ACTIVE_STATUSES.
RUNNING_STATUSES = ("open", "assigned", "in_progress")

# Settled. No SLA, no escalation, no further transitions except reopen.
TERMINAL_STATUSES = ("resolved", "closed")

# Every status, in lifecycle order. The choices on `Ticket.status`.
ALL_STATUSES = ACTIVE_STATUSES + TERMINAL_STATUSES

# Escalation levels above the technician. A ticket is escalated iff its
# current_level is one of these.
ESCALATED_LEVELS = ("hos", "hod")


# ── Hold reasons ──────────────────────────────────────────────────────────────

# (code, label). Labels are what the technician and the HOD read, so they are
# phrased as the reason, not as a category name.
#
# `awaiting_materials` and `awaiting_procurement` split on who can fix it: a
# stores stock-out is the storekeeper's problem, an undelivered order is
# procurement's. Not on "do we have it" vs "are we buying it", which is the
# same event twice and which two technicians would code differently.
#
# `awaiting_requester` is the one delay that is not the section's fault.
# Without it that time hides inside `other` and inflates the section's
# apparent failure rate.
PENDING_REASONS = (
    ("awaiting_materials", "Materials not in store"),
    ("awaiting_procurement", "Order placed, not yet delivered"),
    ("awaiting_approval", "Awaiting approval"),
    ("awaiting_labour", "No technician available"),
    ("awaiting_contractor", "Awaiting contractor"),
    ("awaiting_requester", "Waiting on the requester"),
    ("access_unavailable", "Cannot access the area"),
    ("scope_clarification", "Scope needs clarification"),
    ("other", "Other"),
)

PENDING_REASON_CODES = tuple(code for code, _ in PENDING_REASONS)

PENDING_REASON_LABELS = dict(PENDING_REASONS)

# `other` says nothing on its own, so its note carries the whole meaning and is
# required. Every other code already reads as the reason.
REASON_REQUIRING_NOTE = "other"
