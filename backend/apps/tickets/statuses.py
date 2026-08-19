"""The ticket status vocabulary — defined once.

These sets were previously written out as literals in six places and given
their own local names in two more, and they had already drifted: `check_sla`
and `analytics` agreed, `common/admin.py` quietly used a different set, and
`report_views.py` imported `ACTIVE_STATUSES` and then redefined it locally
under another name a few hundred lines down.

That drift is not cosmetic. The R9 bug — paused tickets counted as breached —
was exactly this: four places computed "is this late?" and disagreed, so a
ticket's own badge contradicted the dashboard it appeared on. Importing from
here is what stops that recurring.

Kept in `tickets` rather than `analytics` because the vocabulary belongs to the
model that has the field; analytics is a consumer of it, like `sla`,
`facilities` and `org`.
"""

# Everything not finished. `pending` is in here: a ticket waiting on parts is
# still open work somebody has to come back to.
ACTIVE_STATUSES = ("open", "assigned", "in_progress", "pending")

# Active *and* the SLA clock is moving. `pending` freezes the timer (R9), so a
# paused ticket's stored deadline drifts into the past while it waits.
# Anything asking "is this late?" must use this, not ACTIVE_STATUSES —
# otherwise a ticket delayed by a shortage nobody can fix turns red for a wait
# the section was told to take, and the breach count stops meaning anything.
RUNNING_STATUSES = ("open", "assigned", "in_progress")

# Settled. No SLA, no escalation, no further transitions except reopen.
TERMINAL_STATUSES = ("resolved", "closed")

# Every status, in lifecycle order — the choices on `Ticket.status`.
ALL_STATUSES = ACTIVE_STATUSES + TERMINAL_STATUSES

# Escalation levels above the technician. A ticket is "escalated" iff its
# current_level is one of these — the same idea was written five different
# ways across analytics, four as this list and one as `~Q(level="technician")`,
# which are only equivalent while LEVEL has exactly three values.
ESCALATED_LEVELS = ("hos", "hod")
