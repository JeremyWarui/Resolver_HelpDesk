"""Why a ticket is on hold — the vocabulary, defined once.

Same reasoning as `statuses.py`: this list is read by the model (choices), the
lifecycle service (validation), the analytics breakdown (a group-by dimension)
and the frontend (the dropdown and the filter). Four readers is four chances to
drift, and this vocabulary had already drifted before it existed — the frontend
shipped a `PENDING_REASON_CHOICES` array captioned "must match Django model
exactly" against a Django model that had no such field, and flattened the code
and the note into one free-text string that nothing could aggregate.

So: defined here, exposed over the API by `TicketFilterOptionsView`, and never
retyped in the client.

`other` is deliberately last and deliberately requires a note. Every categorised
-reason system drifts toward "Other" unless the cheap option is closed off; if
it grows past a small share of holds, that is the signal to promote the common
write-ins into codes of their own rather than to widen the catch-all.
"""

# (code, label). Labels are what the technician and the HOD read, so they are
# phrased as the reason, not as a category name.
#
# The set follows the one that CMMS and service-desk products converge on —
# Maximo (WMATL/WSCH/WAPPR), Archibus (parts/labour/access), BMC Helix and
# ServiceNow all cut it as materials, labour, access, approval, third party,
# customer. There is no ISO or EN standard for these codes; that convergence is
# the nearest thing to one.
#
# Two cuts are deliberate and worth not undoing:
#
#   * `awaiting_materials` vs `awaiting_procurement` splits on *who can fix it*
#     — a stores stock-out is the storekeeper's problem, an undelivered order is
#     procurement's. It does NOT split on "do we have it" vs "are we buying it",
#     which is the same event twice and which two technicians would code
#     differently for the same job.
#   * `awaiting_requester` exists because it is the one delay that is not the
#     section's fault. Without it that time hides inside `other` and inflates
#     the workshop's apparent failure rate.
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

# A note adds nothing to a code that already says everything ("Awaiting
# approval" — from whom is useful, but optional). For `other` the code says
# nothing at all, so the note is the entire content and is required.
REASON_REQUIRING_NOTE = "other"
