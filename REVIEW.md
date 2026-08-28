# Maintenance Helpdesk — Codebase Review Instructions

## 1. Scope

This application is now a helpdesk for the Maintenance Section of the Administration Department at campus level.

Do not design for other departments or sections.

The system is campus-based.

## 2. Roles

- User(Requestor)
- Technician
- HOS — Head of Section
- HOD — Head of Department
- Manager — organization-wide oversight
- Admin — system administration

## 3. Core workflow

User raises a maintenance ticket.

The ticket contains:
- Category/trade
- Service item
- Description
- Location
- Optional attachment

Supported attachments:
JPEG, JPG, PNG, PDF and DOCX.

Once the ticket is created, two instance happens:
1. The ticket can be claimed by technician, or
2. Ticket can be assigned by the HOS/HOD to a technician.

A technician works on the ticket and updates it.

Every change to a ticket is recorded on its activity trail. See section 5.

The HOS supervises technicians.

The HOD supervises the HOS.

Unresolved tickets escalate based on defined time limits:
- First threshold → HOS
- Second threshold → HOD

After resolution, the user can provide a rating and feedback.

## 4. Access rules

### User
- Can create tickets only for their campus.
- Can view their own tickets.
- can provide phone number when raising ticket where technician can contact them.
- Can read the activity trail of their own ticket.
- Cannot read or post comments.

### Technician
- Can only access tickets from their campus.
- Can view tickets belonging to their trade/craft.
- Can work/update on tickets assigned to or claimed by them.
- Cannot access tickets from another campus.
- Cannot access tickets from another trade, unless they have more than one trade.
- Can comment only on tickets assigned to them.

### HOS
- Can view maintenance tickets within their campus.
- Can assign tickets to technicians.
- Can set priority.
- Supervises technicians.
- View escalated tickets and pending tickets
- Can comment on any ticket at their campus.

### HOD
- Can view maintenance tickets within their campus.
- Can assign tickets.
- Can set priority.
- Supervises the HOS.
- Views escalated tickets and pending tickets
- Can comment on any ticket at their campus.

### Manager
- Has organization-wide reporting and analytics.
- Can compare campuses, categories, facilities and performance.
- Does not need operational access to individual tickets unless required.
- Cannot comment. Oversight is read-only.

### Admin
- Has overall administrative visibility and access.

No User, Technician, HOS or HOD may access another campus's tickets.

## 5. Ticket activity and comments

These are two separate things with two different audiences. Do not merge them.

### Activity trail

Every ticket records what happened to it, in order, with who did it and when:

- Opened
- Assigned or reassigned
- Status changes
- Placed on hold, with the reason
- Escalated, and to whom
- Priority changed
- Resolved
- Closed
- Reopened
- Rated

The trail is append-only. It is never edited and never deleted.

The requester reads the trail of their own ticket. This is how they follow
progress, and it is what they get in place of comments.

The requester's trail omits comment events. A row they cannot open is a dead
end pointing at a thread they are refused.

### Comments

Comments are the staff working log, not a conversation with the requester.

- The requester can neither read nor post them.
- No comments before a technician is assigned.
- No comments after the ticket is closed.
- Among technicians, only the assignee may post.
- The manager cannot post.

There is no public/internal split. Every comment is staff-facing, because the
requester never reaches the thread.

## 6. Notifications

Users are told about events on tickets they are involved in.

Notified on:
- Ticket created → the HOS and HOD of that campus
- Ticket assigned → the technician, the requester, and the outgoing technician
  if it was a reassignment
- Status changed → the requester
- Ticket escalated → whoever it escalated to, and the assigned technician
- Ticket resolved → the requester
- Comment added → the assigned technician. **Never the requester.** They are
  refused the thread, so notifying them would hand them through the feed the
  content the endpoint withholds.
- SLA breach → the HOS and HOD of that campus

Rules:
- Each user reads only their own feed.
- Notifications are polled, not pushed.
- A notification that fails must never break the action that triggered it.

Keep this simple. No digests, no per-user preferences, no channels beyond the
in-app feed.

## 7. SLA and escalation

Every ticket carries a priority. It opens at the lowest and the HOS sets the
real one when they assign it. A requester never grades their own urgency.

Each priority defines four durations:
- Response target — creation to first assignment
- Resolution target — creation to resolved
- First escalation threshold → HOS
- Second escalation threshold → HOD

Escalation is structural: Technician → HOS → HOD, and nothing else. It is not
configurable workflow. A vacant post is skipped and the ticket carries on
upward rather than resting where nobody is watching.

### The clock

The clock starts when the ticket is raised. Time spent unassigned is part of
what the SLA measures.

A ticket on hold freezes the clock. Time on hold counts toward neither target
nor the escalation thresholds — a job waiting on a part nobody could supply
did not take that time of anybody's work. Both targets move out by however
long the hold lasted when work resumes.

A hold names its reason from a fixed list. It is never free prose, or the
reason cannot be reported on.

Reopening a ticket restarts the clock, and clears the hold and the assignee
with it.

### Overdue is not the same as missed

- **Overdue** — live now and past its target.
- **Missed** — settled, and it finished after its target.

A settled ticket is judged against when it was resolved, never against the
current time. Comparing a closed ticket's target to "now" marks every ticket
ever closed as late once that date passes.

Never show the two under one label.

## 8. Reporting

Keep reporting simple and useful.

Required information may include:
- Ticket volume
- Ticket status
- Category/trade
- Facility/location
- Response time
- Resolution time
- Overdue/escalated tickets
- Technician performance
- User ratings and feedback

Do not introduce advanced analytics unless required by the existing system requirements.

# Code Review

Review the entire codebase before making major changes.

Inspect:
- Models
- Serializers
- Views
- URLs
- Permissions
- Utilities
- Services
- Signals
- Tasks
- Tests
- Other relevant modules

First map the existing implementation to the requirements above.

For every significant component, determine:

- What requirement does it support?
- Is it actually necessary?
- Is the implementation more complicated than necessary?
- Is the same responsibility implemented elsewhere?
- Can it be removed or consolidated?

Classify components as:

- KEEP — required
- SIMPLIFY — required but unnecessarily complex
- CONSOLIDATE — duplicated or overlapping
- REMOVE — not required
- UNCLEAR — requires confirmation

## Engineering Principles

Use:

- KISS
- DRY
- YAGNI
- Readability
- Direct implementations
- Django/DRF built-ins where sufficient

Do not preserve existing code simply because it already exists.

Do not introduce abstractions, design patterns, services, repositories, utilities or layers unless they solve a real requirement or duplication problem.

Do not add functionality that has not been requested.

Do not optimize for hypothetical future requirements.

Do not create multiple ways of doing the same thing.

Prefer one clear implementation over several flexible implementations.

Reduce unnecessary comments, including `#` comments.
Comments should explain non-obvious decisions only.

## Testing

Tests are reviewed like all other code. A test is justified only by a requirement in this spec; tests asserting unrequested behavior are removed in the same commit as the code they cover. Before trimming, derive the minimal test list directly from Access rules and workflow, then reconcile existing tests against it. Permission and campus/trade-scoping tests are kept .

Do not treat a passing test suite as the goal. A green suite that passes by preserving overkill code is a failure. Success is: every requirement in this spec has a test, and no test asserts behavior the spec does not call for.

First produce the minimal spec-derived test list and present it for sign-off before refactoring against it. Do not redefine the basic requirements during the refactor.

## Important

Do not start by rewriting the code.

First understand and map the existing codebase.

Then identify:
1. What should remain
2. What should be simplified
3. What should be consolidated
4. What should be deleted
5. What is missing

After that, propose the refactoring order.

The goal is not to preserve the existing architecture.

The goal is a small, clear, maintainable implementation that satisfies
the requirements above — and nothing more.
