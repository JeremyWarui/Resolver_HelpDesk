# Architecture — Resolver HelpDesk

Status: **as built**.

Where this document and the code disagree, the code is right and this is a bug.
Fix the document in the same commit.

## 1. Organisational hierarchy

```
Department            Administration                     (the only department)
  └── SectionType     Maintenance                        (global blueprint)
        └── SubSection  Carpentry · Masonry · Painting    (global, NEW model)
              │         Plumbing · Electrical
              └── ServiceItem  "Replace door hinge", "Faulty socket", …

CampusDepartment      (Campus × Administration)
  └── Section         campus instance of a SectionType — exactly ONE `hos`
        └── SectionTechnician  (user, section, sub_section)
```

`SubSection` is **global** — it hangs off `SectionType`, not off `Section`. Carpentry
is defined once and every campus's Maintenance section has it. A campus that does no
masonry simply has no masonry technicians. This mirrors the existing
`SectionType` (global) / `Section` (campus instance) split exactly.

### Why SubSection rather than more SectionTypes

Making each trade its own `SectionType` would give each campus five Sections, each
with its own HOS. The org has **one HOS over Maintenance**. Introducing the
sub-section level keeps `Section.hos` as a single FK — correct by construction —
and removes the need for a `SectionHead` join table.

### Future extensibility

Security, Transport, Telephone Exchange, Staff Housing and Cleaning each become a
`SectionType` under Administration, with their own SubSections (Security →
Guarding, CCTV, Access Control) and their own HOS per campus. **Seed data only —
no schema change.**

One reporting consequence, recorded here because it is invisible from the code:
with Maintenance the only section type, a Section *is* a campus, so a per-section
breakdown and a per-campus breakdown draw the same rows. **Every display
dimension that was `section` is therefore `sub_section` (trade)** — the reports
page's Section Analysis tab (removed outright), the dashboard volume and
distribution charts, the analytics donut and performance table, the HOD
"Sections" page, and the ticket tables' Section column and filter. A HOD had been
reading "Section Ticket Volume: Maintenance 11" and a donut at 100% Maintenance;
a manager's section chart restated the campus chart directly above it.

`role_config` had encoded this from the start — HOD defaults to `sub_section` and
is not allowed `section` — so the change only brought the UI into line with the
role config. Backing endpoint: `/analytics/performance/trades/`. Admin and
manager, whose scopes both resolve to the whole organisation there being one
department, were given the same tab list.

The section plumbing is intact underneath. `PerformanceBreakdownReport` keeps its
`section` dimension, `usePerformanceSections` still exists, and
`/analytics/performance/sections/` is still served and still tested. Adding a
second section type therefore needs no new plumbing: seed the `SectionType`, then
restore the tab in `RoleReportsPage` — a `TabId` member, a label, an icon, the
role's `tabs` entry and a view block passing `dimension="section"`, about twenty
lines — and switch the charts back where a section split becomes meaningful.

## 2. Catalogue

`catalog.ServiceCategory` is deleted; `ServiceItem.category` becomes
`ServiceItem.sub_section`.

`location_details` went too — it moved to `SubSection` first, then out
altogether (§5b).

**Priority leaves the catalogue entirely.** `ServiceCategory.default_priority`
and `ServiceItem.default_priority` are both gone; a ticket opens at
`Priority.default()` and the HOS sets the real one at assignment (§5a).

Rationale: SubSection "Carpentry" and ServiceCategory "Carpentry Services" are a 1:1
redundancy — two tables for one concept, plus a dead step in the ticket wizard. If a
trade later needs internal grouping (Electrical → Lighting / Power / Generators),
re-adding a level is a cheap migration.

With one model left, `ServiceItem` folds into `apps.org` and the `catalog` app is
deleted.

## 3. Roles

| Role | Scope | Source of truth |
|---|---|---|
| `admin` | everything | — |
| `manager` | Administration across **all campuses** — the Corporate Director / Corporate HOD | `Department.manager_user` |
| `hod` | one campus's Administration | `CampusDepartment.head_of_department` |
| `hos` | one campus's Maintenance section, all trades | `Section.hos` |
| `technician` | own section **and own sub-sections only** | `SectionTechnician` |
| `user` | own tickets | `Ticket.raised_by` |

**Scope is what you see; it is not what you may do.** The two come apart at
exactly one role. A `manager` reads every campus and may act on none of them:
they oversee the estate through Analytics and Reports, while the work itself is
held and moved by the HOS who staffs it. So assign, claim, status change and
deleting someone else's attachment are refused for a manager even though the
ticket is squarely inside their scope — `403`, from the role gate, not the
scope gate.

The sets live in `apps/common/roles.py` and nowhere else:

| Constant | Members | Gates |
|---|---|---|
| `TICKET_SUPERVISOR_ROLES` | admin, hod, hos | acting on someone else's ticket — status, attachment delete |
| `OVERSIGHT_ROLES` | manager | oversight without ticket authority |
| `ANALYTICS_ROLES` | the two above combined | the supervising Analytics endpoints |
| `STAFF_ROLES` | ticket supervisors + technician | staff-only ticket actions — assign |

`ANALYTICS_ROLES` is built by concatenating the other two rather than typed out,
which is what makes the single-element tuple `("manager",)` impossible to write
as the bare string `("manager")`: the string raises `TypeError` at import
instead of silently matching any substring. `tests/test_manager_oversight.py`
holds the boundary.

`RoleAssignment` is **one row per user** (`OneToOneField`), held for as long as
the person holds the post. A role has no validity window and cannot be switched:
`is_primary`, `valid_from`, `valid_until`, `is_active()`, `is_demoted()`, the
`one_primary_role_per_user` partial index, `SwitchRoleView`, `available_roles`
and `apps/common/time_windows.py` do not exist, and `tests/test_auth.py` holds
that boundary.

**Only admin assigns roles.**

## 3a. Identity is the email address

People sign in with their email, never a username: `POST /auth/login/` takes
`{email, password}` and resolves the account itself, because Django
authenticates on `username` and only the server knows the mapping.

Everything else about a new account is derived from that address, in
`apps/accounts/identity.py`:

```
jeremy.mwangi@ksg.ac.ke  →  username   jeremy.mwangi   (the local part, lower-cased)
                            first_name Jeremy          (dot-separated, title-cased)
                            last_name  Mwangi
```

`POST /auth/register/` therefore takes only `{email, password, campus_id}` — a
`first_name` or `username` posted alongside is ignored, so the name a ticket is
raised under can never drift from the address it was raised from. A local part
with no dot (`jmwangi@…`) gets an empty last name rather than an invented one;
the same local part at a second domain gets a numeric suffix, since emails are
unique but local parts are not.

There is no override anywhere, and that is the point. `POST /api/v1/users/`
(admin creation) takes `{email, password, campus_id}` and derives the rest, so
an admin-created account is indistinguishable from a self-registered one.
`PATCH /api/v1/users/{pk}/` accepts no name fields at all: **changing the email
renames the account**, re-deriving username, first and last name together
(`identity_from_email(email, exclude_pk=...)` — the exclusion is what stops
someone colliding with their own old username and becoming `jeremy.mwangi1`).
The credential moves with it, since the credential *is* the address.

One consequence worth knowing: **email is not unique at the database level.**
Registration, admin creation and admin update all reject a duplicate
case-insensitively, but a `createsuperuser` account with a blank email can still
collide, so `_authenticate_by_email()` tries every match rather than assuming
one. A `unique=True` migration would fail on exactly those legacy rows.

Front-end mirror: `frontend/src/utils/identity.ts` previews the derivation while
the address is being typed (register form, admin Add/Edit User, technician
form). It is a preview only — the server decides — but it must stay in step, or
the name someone is shown before submitting is not the name they get.

## 3b. Displacing a supervisor demotes them

**One post, one holder.** Filling a supervisor post takes it off whoever had it,
and that person becomes a plain requester.

There are two answers to "who runs this section", and they must not disagree:

| | Written by | Read by |
|---|---|---|
| `RoleAssignment.section` / `.campus_department` / `.department` | the admin role-assignment endpoint | every UI label, the JWT role claim |
| `Section.hos`, `CampusDepartment.head_of_department`, `Department.manager_user` | `_sync_org_scope`, on the same request | **`scoped_ticket_qs` — i.e. all actual access** (§3 table) |

Those pointers are single-valued, so promoting a second HOS to a section
displaces the first. `accounts.posts.assign_role` writes both columns in one
transaction, because updating only the right-hand one leaves the displaced
person:

- still listed as Head of Section on the admin Users page, with the section
- still carrying `role=hos` in their JWT, so still landing on the HOS portal
- and returning **nothing** from every scoped query

A Head of Section with no section. Observed live: promoting Grace Njeri to
NRB-ADM-MTCE left Peter Kimani at 0 tickets while Grace saw 50, with Peter's
role row untouched. It was unreachable until role assignment stopped 500ing on
every call, because until then nobody had ever successfully displaced anyone.

`_demote_displaced()` closes it. The incumbent is read *before* the `update()`
overwrites them, then their `RoleAssignment` is replaced with `role="user"` and
all three scope FKs null. Demoting rather than deleting keeps the one-row-per-user
invariant, and `user` is the floor role everyone has anyway. It is deliberately
not a guess at what they should be instead: if they are moving to another
section, the admin assigns that next.

Two cases must not demote anybody, and both have tests:

- **Re-assigning the holder to their own post** is a scope edit, not a
  displacement. Without the `displaced == target.pk` check they would be
  demoted a moment after being promoted.
- **A vacant post** — the common case for a new section.

The POST response carries a `displaced` object when this fires, and
`UserFormDialog` raises it as a 10-second warning toast. An admin filling a post
rarely knows who was in it, and demoting someone is a larger change than the one
they asked for; the only other place it would surface is an empty dashboard
belonging to somebody nobody has told.

The rejected alternatives, for the record: allowing several holders per scope
(scope would read `RoleAssignment` and `Section.hos` would become a
"primary contact" label — touches every scope branch), and refusing the
assignment with 409 until the admin demotes the incumbent first (fewest lines,
most clicks).

## 4. Scope enforcement

All reads go through `scoped_ticket_qs(user, role)`. Scope derives server-side from
the JWT role claim, never from client params, and fails closed.

### The technician branch is the one dangerous edit

Technician scope is **two-dimensional: campus AND trade**. An Electrical technician
at Nairobi sees Electrical tickets at Nairobi — not Electrical at Mombasa, and not
Plumbing at Nairobi.

The campus dimension comes free through `Section`: a `Section` is the campus
instance of a `SectionType`, so `NRB-ADM-MAINT` and `MSA-ADM-MAINT` are distinct
rows. `SectionTechnician(user, section, sub_section)` therefore pins both axes at
once — `(NRB-ADM-MAINT, Electrical)`.

```python
# WRONG — cross product of two independent __in lookups. A technician who is
# Carpentry@Nairobi and Plumbing@Mombasa would also match Plumbing@Nairobi
# and Carpentry@Mombasa: two campus/trade pairs they were never assigned.
base.filter(section__in=section_ids, sub_section__in=sub_section_ids)

# CORRECT — pairwise. The (section, sub_section) combination must exist on a row
# belonging to this user. One query, uses unique(user, section, sub_section).
link = SectionTechnician.objects.filter(
    user=user,
    section_id=OuterRef("section_id"),
    sub_section_id=OuterRef("sub_section_id"),
)
return base.filter(Exists(link))
```

The two forms agree for a technician assigned at a single campus and diverge only
for multi-campus technicians — which is exactly why the bug would survive casual
testing and reach production. Use the pairwise form unconditionally.

`Ticket.sub_section` is denormalised from `service_item.sub_section`, and
**non-nullable**, for two independent reasons — either alone would justify it:

- the `Exists` above matches on it, so a null makes the technician queryset
  silently empty;
- `analytics.aggregate()` may only touch direct `Ticket` columns: join fan-out
  there multiplies rows and turns the aggregate into a timeout. Per-trade
  breakdown is the headline dimension of this system.

Required negative tests (both must exist before the branch is written):

- Electrical@Nairobi technician does **not** see Electrical@Mombasa tickets
- Electrical@Nairobi technician does **not** see Plumbing@Nairobi tickets
- and gets 403 — not an empty list — on `claim`, `status`, `comment`, `logs`,
  `attachments` for either

Two further places key on section alone today and must gain a sub-section predicate,
or a HOS can assign work to someone who then gets a 403 on their own ticket:

- `TicketAssignSerializer.validate` — the assignable-technician check
- `SectionAssignableTechniciansView` — the assignment dropdown

## 5. Ticket creation

The requester picks a **service item**; everything else is derived server-side.

```
1a  trade         Electrical │ Plumbing │ Carpentry │ Masonry │ Painting
1b  service item  Faulty socket │ Replace bulb │ Generator issue
2   description + attachments + contact phone + location (always)
3   review + submit
```

Step 1a lists only the trades the requester's own campus runs — `GET
/catalog/?campus=`, which is campus-required and returns 400 without it.

The requester never sees the word "trade" in their own UI; it is staff
vocabulary (the admin catalogue, the assignment modal) because it names the
technician-scoping boundary. To a requester these are just the maintenance
services their campus offers.

`contact_phone` is optional, Kenyan-only, and stored on the ticket in E.164
(`+254712345678`) — not read from the profile at display time. Two reasons: the
useful number is often not the requester's (a caretaker, whoever is actually in
the room), and a profile edit must not rewrite the history of a job that closed
months ago. Blank falls back to the profile number, tolerating an unusable one;
a user with no number anywhere can still raise a ticket.
It appears on the ticket **detail** only — one number is a technician doing
their job, a page of them is a contact-list export.

Normalisation lives in `apps/common/phone.py`, the single definition of what a
number is. Mobiles are 9 national digits beginning 7 or 1; landlines 8-9
beginning 2-6. Everything else — a foreign number, a wrong prefix, a wrong
length, or text with no digits in it — is rejected rather than stored, because
a number that cannot be dialled costs the technician a wasted trip.

Derived at submit: `requester_campus` (from profile — never asked), `section`
(routing), `sub_section` (from the item), `ticket_no` (sequence). Priority is
**not** derived — every ticket opens at Low.

## 5a. Priority

Priority is a property of a *ticket*, not of a service. "Faulty socket" can be a
dead bulb or a live wire, and a catalogue default would rate both identically —
so the requester never picks one and the catalogue never carries one.

```
raise    → priority = Priority.default()   (lowest rank, i.e. Low)
assign   → HOS optionally sets Low | Medium | High | Critical
```

The HOS is the right decider: they have read the ticket and know the section's
workload. `POST /tickets/{pk}/assign/` therefore takes an optional `priority`
alongside `assigned_to`; omitting it leaves the ticket where it is.

Changing priority recomputes `response_due_at` / `resolution_due_at` **from
`created_at`, not from the assignment time** — the SLA clock has been running
since the requester raised it, and re-basing would hand back time already
spent waiting. The change is written to `TicketLog` as `priority_changed`.

The UI puts the priority control **above** the technician list, not below it.
The two judgements feed each other — how urgent this is decides who can
realistically take it — so choosing the person first, then the urgency from
below a scrolling list, is the wrong order. It is pre-selected to what the
ticket already carries, so "leave it at Low" costs nothing.

## 5b. Location

**Every ticket carries one.** There is no service for which the question is
skipped: maintenance work happens somewhere, and a ticket the technician cannot
find is not a ticket. What varies is *which fields* are asked for, and that is
the facility type's job — not the trade's.

`SubSection.location_details` existed to gate this and is gone. The seed set it
true for all five trades, which made it a boolean that could not be false —
configuration pretending to be a decision.

Six facility types, in `apps/facilities/validators.py::TYPE_SPECS`, which is the
whole contract: `required` and `optional` are the fields offered, `known` rejects
anything else posted, and `building_dropdown` says whether a named facility off
the register must be picked.

| Type | Required | Optional | Names a facility? |
|---|---|---|---|
| `office_block` | floor, room | area | yes |
| `hostel` | room_number | area | yes |
| `building` | — | room, area | yes |
| `residential` (Staff Quarters) | tenant_name | unit_number | no |
| `equipment` | asset_name | asset_id, description | no |
| `grounds` | zone | landmark | no |

`building` is the catch-all for everything the register names but that has no
interior scheme of its own — conference centres, dining halls, gate houses,
recreational blocks. It is the one type requiring no `values` at all: the
facility *is* the location, and room/area only narrow it down. So a type must
offer either a named facility or at least one field, which is what
`test_every_type_asks_for_something` asserts.

Hostels and staff quarters are deliberately different. Hostel occupants rotate
per course, so the room identifies the fault and the person in it is nobody in
particular. Staff quarters are a standing household, so the tenant is who the
technician arranges access with — which makes them the part worth insisting on.

The frontend mirrors this table in `TicketCreationWizard.tsx::FACILITY_FORMS`
and renders all six through one loop. The duplication is accepted: it is nine
short lines, and serving the spec would be a new endpoint contract to keep in
step. Changing `TYPE_SPECS` means changing both in the same commit.

The wizard fetches `GET /facilities/?campus=` **once** and groups by type
client-side, rather than one request per type the requester clicks. Each row
carries `facility_type`, `type` and `facility_type_name`, which is enough to
draw both the type tiles and the facility dropdown — so there is no
`/facility-types/` call, and no further request as they click around. It also
means only types the campus actually has anything for are offered.

## 6. Not in scope

**No WebSockets.** `Notification` and its REST endpoints are polled over plain
HTTP. Three reasons: a maintenance helpdesk runs on a minutes-to-hours cadence;
WS forces ASGI + Redis into the deploy for a low-volume single-department app,
and silently no-ops when the channel layer is missing; and a correct channel
guard would need groups keyed on `(section, sub_section)` with membership
re-derived from `SectionTechnician`, which is scope this app does not need.

**No web push.** Needs HTTPS + VAPID key rotation for a browser toast.

**Mobile PWA is in scope**: mobile ticket views and service-worker caching.
There is no offline action queue. `MobileTicketDetail`'s status actions and its
comment box both abort with "you are offline" instead.

## 6a. Rating the work

`TicketFeedback` is one rating per ticket, from the requester, at or after
`resolved`. There is no free-floating "how are we doing" feedback and no model
for one.

The rating is reachable from the ticket detail ("Rate & close"), which on its own
means a requester who never reopens the ticket leaves it unrated forever — and
the satisfaction figure ends up built from whoever happened to click through. So
the list serializer carries `has_feedback`, an `Exists` annotation and a flag
rather than the rating itself, and the requester's dashboard shows a prompt only
when resolved tickets are actually waiting on them. A permanent nav item would
sit empty for someone who raises three tickets a year.

`GET /tickets/feedback/` lists ratings for the Feedback tab (technician, HOS,
HOD, manager). It filters through `scoped_ticket_qs` rather than defining a
second rule: a rating should be readable by exactly the people who could already
read the ticket it belongs to. A technician therefore sees ratings across their
whole trade, not only work they personally did — a trade's reputation is shared —
while the campus and trade boundaries still hold.

## 6b. Working a ticket

How a ticket moves once it exists, and how the people who own it can tell:
claiming vs assignment, the handover note, the technician's two lists, the
status filter, escalation visibility, and the sidebar counts.

### Claiming vs being assigned

Claiming and being assigned are different, and the UI treats them differently.

`claim_ticket` drives `open → assigned → in_progress` in one action, logging both
hops. A technician clicking claim on the open queue is volunteering: there is no
real gap between claiming and starting, and a second "accept" click would only
let people claim jobs and sit on them.

Assignment by the HOS leaves the ticket at `assigned`, and it stays there until
the technician acts. That dwell **is** the response-time SLA — auto-advancing to
`in_progress` would make `response_due_at` measure nothing. Leaving it is a
one-tap "Start work" button rather than a trip through the status modal, which
insists on a progress note. Transitions that record a *decision* need words
(`pending` needs a reason, `resolved` needs a note); transitions that record
*starting* do not.

### The handover note

Assignment carries an optional `note` — the HOS's message to the technician
they are handing the job to. It is stored as `reason` on the **`assigned` /
`reassigned` TicketLog row**, never on the Ticket: it describes the handover,
not the ticket's own state (invariant 2), and a later reassignment must not
overwrite what the previous one told the previous person. Each handover keeps
its own note, and the timeline renders both.

`AssignmentModal` had collected this note since it was written and
`assignTicket()` never sent it — the field existed, was typed into, and was
dropped on the floor. The serializer, the log write, the API call and the
timeline's `NOTE_EVENT_TYPES` allowlist all had to change together; any one of
them left out puts the box back on screen with nothing behind it.

Blank is omitted rather than sent as `""`, so an unused note leaves no trace in
the audit log at all.

### Section Tickets vs Assigned Tickets

The technician has two lists and they answer different questions.

**Section Tickets** is the claimable pool: `scoped_ticket_qs` unchanged, so it is
the technician's (campus, trade) pairs — *not* the whole section. A plumber at
Nairobi sees Nairobi plumbing, including work assigned to other plumbers and work
assigned to nobody. It is read-only by design: the row actions column is off, and
the detail sheet offers Claim and nothing else until the ticket is theirs.

The trade narrowing is entirely server-side and needs no client filter: the page
passes no `sub_section`, and `/tickets/filter-options/` builds the trade dropdown
from the caller's own rows, so it offers only trades they hold. Miriam Odongo
(Electrical + Plumbing at Mombasa) is offered exactly those two of the
section's five. The cards above the table are labelled "In your trades at this
campus" because they reuse the HOS aggregate, whose "All tickets in your
section" would claim a scope the technician does not have.

**Assigned Tickets** is their own queue: the same scope narrowed by
`assigned_to=<self>` (`TechTickets.tsx`, `fixedParams`). It holds tickets the HOS
assigned to them *and* tickets they claimed — claiming sets `assigned_to`, so the
ticket moves lists as a consequence of the same write, with nothing extra to keep
in sync.

The narrowing is a `fixedParams` entry rather than a filter default because a
filter can be cleared. Without it the page falls back to the full section scope,
which silently turns the personal queue into a second copy of Section Tickets.

### The status filter on ticket tables

Ticket tables filter by status through `createStatusFilter`, which offers all six
of `ALL_TICKET_STATUSES`. The shared table (`TicketsPage/TicketsTable.tsx`, used
by admin/manager/HOD/HOS) also carries the pill row, which is a shortlist —
All / Open / In Progress / Overdue / Resolved — so Assigned, Pending and Closed
are reachable only from the dropdown.

Both controls drive one `statusFilter`, so they are kept in step deliberately:
choosing a status sets the pill state too, which lights the matching pill or none
at all when no pill represents it. Selecting a status also clears **Overdue**,
which is a cross-status flag rather than a status — left set it would intersect
with the choice and draw an empty table with nothing on screen explaining why.

### Seeing that a ticket escalated

Escalation is structural, not configurable workflow (CLAUDE.md invariant 4):
the engine moves a ticket technician → HOS → HOD
when its *active* time passes the threshold on its priority. It runs from
`manage.py process_auto_escalations` — nothing in the request path triggers it,
so on a live demo nothing escalates until that command is run. The seed calls
`run_escalations()` at the end for exactly that reason.

`current_level` was serialised, typed and filterable long before anything
rendered it. The only surface was the **Escalated** page, which HOS and HOD had
and the technician did not — so the person actually holding an escalated job was
the one person who could not tell it had escalated, and a HOS looking at their
ordinary Tickets list saw an escalated row drawn identically to every other one.

Escalation also notifies, and it notifies exactly two people: the holder the
ticket escalated **to** (the same user the `TicketLog` records as `level_user`,
resolved structurally by `resolve_active_holder`) and the technician it was
assigned to, told that the job on their list has moved up a level. The holder is
passed into `emit_ticket_escalated` rather than looked up again there — the
structural FKs and `RoleAssignment` can disagree, and the earlier emitter
broadcast to every HOS and HOD found by role lookup, which both told supervisors
about tickets never handed to them and could miss the one person it was. When
the assignee *is* the holder they are told once, not twice.

Two further changes close the visibility gap:

- **`EscalationBadge` rides in the status cell**, and that is the whole signal.
  It says only how far the ticket climbed — `HOS` or `HOD`, abbreviated because
  spelled out it was wider than the status pill it annotates and read as the
  row's headline rather than a marker on it. It sits in the status cell rather
  than a column of its own: `status` is the only column no variant in
  `VARIANT_COLUMN_VISIBILITY` hides, so one edit to `TableUtils.statusColumn`
  covers every table for every role, where a dedicated column would have meant
  an entry in six visibility maps and an em dash in every cell of the tickets
  that never escalate.

  There was a red row tint beside it (`escalatedRowClass`), applied by
  `TechTickets` and `TechSectionTickets`. It is gone, and the helper with it.
  On a busy Tickets list it repainted every escalated row and competed with the
  SLA colours those lists are actually read for; the badge already carries the
  fact, in the one cell every variant shows. Row tinting now belongs to the two
  pages that tint on something the list is *about*: EscalatedWorkView on
  `is_breaching` and SLATrackingView on breach state. (The two facts are easy to
  confuse — the Escalated page looked like it marked escalation only because its
  rows are mostly breaching too.)
- **The technician gets the Escalated page**, `EscalatedWorkView role="technician"`.
  Its scope is the technician's (campus, trade) pairs — the same pool as Section
  Tickets, not only what they are assigned — so the copy says the section's
  work, not "yours". Escalating reassigns nothing; the badge and the page are a
  heads-up, and every action on the ticket stays where it was.

### The technician's two queues

The technician has Pending Work and Escalated, the same two pages the section
heads have, rendered by the same `PendingWorkView` and `EscalatedWorkView`.

Both are **scoped to what the technician holds**, not to their server scope.
That is the one place in the app a page narrows past `scoped_ticket_qs`, and it
is deliberate: a technician's scope is their whole (campus, trade) pool, but
`TicketStatusUpdateView` lets them change status only on tickets assigned to
*them* — "section scope alone gives view-only". A section-mate's held job
listed here would carry a Resume button the server answers 403 for, and a page
of colleagues' late work is a list nobody owns. Section Tickets already shows
the trade.

The narrowing is `assigned_to`, which filters *within* the server's scope and
can never widen it, and the fetch is skipped until the user id is known so the
un-narrowed request never fires. `useNavCounts` applies the same rule to both
badges — the counts and the pages would otherwise disagree, which is the whole
reason the counts live in one hook.

Escalated originally listed the whole trade for a technician, on the reasoning
that escalation is the section's problem. That reasoning was sound about
escalation and wrong about the page: nothing on it was theirs to act on.

`e2e/technician-queues.spec.ts` asserts the request carries `assigned_to`
rather than that the page renders — the un-narrowed version renders perfectly
well. It matches on `page_size=200` to pin the page's own request; matching
`status=pending` alone caught the sidebar badge's `page_size=1` query, which is
narrowed separately, and passed against a broken page.

### Counts on the sidebar

`Escalated` and `Pending Work` carry a live count in the nav — "Escalated (28)".
Both answer "is there anything here worth opening?", which was otherwise only
answerable by opening the page. `useNavCounts` fetches them with `page_size: 1`
and reads only `count`, so it costs one row rather than the two hundred the
pages themselves ask for, and both queries are role-scoped server-side like
every other ticket read — a HOS's badge counts their section, a technician's
counts their trades, with no client-side filtering that could disagree with the
page it labels.

It renders as a notification pill on the right of the row, coloured with the
same token as the thing it counts — `--status-escalated` red, `--status-pending`
purple — so the number and the rows it refers to read as one signal. Collapsed
to the icon rail there is no room for a number, so the pill degrades to a dot on
the icon and the count moves into the tooltip.

Zero is not rendered at all: a badge reading "0" draws the eye to precisely the
item with nothing in it. Only those two items carry counts — a count on
`Tickets` would be the whole backlog, a number nobody acts on.

`?escalated=1` is a filter over the already-scoped queryset, so it narrows and
never widens: `test_a_technician_sees_escalation_in_their_own_trade_only` is the
negative — an escalated plumbing job stays invisible to an electrician.

## 7. Known tech debt

**Tailwind config is inert.** `src/index.css:1` is `@import 'tailwindcss';`
with no `@config`, so under Tailwind v4 + `@tailwindcss/vite` the config file
is never loaded and `tailwindcss-animate` is never registered. Every
`animate-in` / `fade-in-0` / `zoom-in-95` class is a no-op and overlays snap
open instead of animating. Wiring it up would double-wrap the already-`oklch()`
tokens and break every colour, so it is recorded rather than fixed.


## 7a. Keeping the two halves in step

Frontend code can call an endpoint that does not exist and still compile,
build and pass lint. The first sign of it is a 404 in front of a user.

The check is mechanical: extract every `apiClient.<verb>('…')` path, extract
every Django route, diff them. Worth re-running after any batch of endpoint
changes.

**There is one API mount.** `/api/v1/` is it. If a path outside `/api/v1/` ever
answers, that is the bug: a second mount of `apps.accounts.urls` puts an
unwatched copy of the login surface on a second path, and because both mounts
share URL names, `reverse()` resolves to the v1 copy and hides the duplicate
from inside the code.

**Compare trailing slashes exactly.** The first version of this check
normalised them on both sides, which hid a real bug: the client posted to
`/notifications/read-all` and the route is `notifications/read-all/`. With
`APPEND_SLASH` that is a redirect, the redirect turns the POST into a GET, and
"Mark all read" answers 405. A path that differs only by a slash is a
mismatch, not a match.

### The other half: render it

The route diff catches calls to endpoints that do not exist. It says nothing
about a call that succeeds and a page that then renders the answer wrongly, and
that class has been the more common one here — a mislabelled column, a dead
quick-access card, a chart with no data behind it, a search box that filtered on
a property its rows did not carry. `tsc` is green for all of them.

`frontend/e2e/` is the repeatable version of that check:

| Spec | What it protects |
|---|---|
| `admin-navigation` | every sidebar entry changes URL *and* content; the My Requests context switch |
| `catalogue` | Section Type → Trade → Item CRUD, and cascade delete |
| `users` | user CRUD |
| `facilities` | the New Facility dialog actually creates one (the required FK reaches the server) |
| `ticket-lifecycle` | raise → route → claim → resolve, plus a same-campus/different-trade negative; the raise step attaches a real PNG and the technician step asserts it rendered |

Run it with `E2E_PASSWORD=<seed password> npm run test:e2e`. Both servers
start automatically; the backend command must point at **`../backend`**, which
is worth checking if the suite ever starts behaving like a different
application.

## 8. Target app layout

```
apps/
  common/      roles (tiers + permissions), pagination, phone, admin, seed
  accounts/    CustomUser, UserProfile, RoleAssignment(1:1)
               identity / scope / posts
  org/         Campus, Department, CampusDepartment, SectionType,
               SubSection, Section, SectionTechnician, ServiceItem
  sla/         Priority, EscalationRule; clock (due dates + predicates),
               escalation
  facilities/  FacilityType, Facility, validators
  tickets/     Ticket, Location, Log, Comment, Feedback, Attachment,
               Sequence; constants / scope / lifecycle / attachments
  analytics/   services, insights, role_config, views, report_views
  notifications/  Notification model + REST
```

8 apps, 23 models, 47 modules. No app has a `services/` subpackage: a module
that a package would have held sits directly in the app.

Every module carries a **Used by** list in its docstring, naming the app
modules that import it. It is a fact about the current code, not an intention.
`test_used_by_headers.py` reads the AST and fails on a name that no longer
imports the module, and on an importer the header omits.

A module docstring also opens with a **Contents** index: one line per model,
function or property, giving its purpose and, where it is not obvious, why.
Everything below the header carries only what the index cannot — the why behind
a line, a return shape, a trap — so a comment that restates the code or the
index is deleted rather than kept. Converted so far: **accounts**.

### Where the shared vocabularies live

A value repeated across modules gets exactly one definition, because every one
of them has drifted here at least once:

| Definition | Home | Read by |
|---|---|---|
| `ACTIVE/RUNNING/TERMINAL_STATUSES`, `ESCALATED_LEVELS`, `PENDING_REASONS` | `apps/tickets/constants.py` | tickets, sla, analytics, facilities, common |
| `TICKET_SUPERVISOR_ROLES`, `STAFF_ROLES`, `ANALYTICS_ROLES`, `IsAdminGroup`, `IsAdminOrReadOnly` | `apps/common/roles.py` | accounts, org, sla, facilities, tickets, analytics |
| `SCOPE_FIELD_BY_ROLE`, `SECTION_PATH_BY_ROLE`, `technician_pair_exists()` | `apps/accounts/scope.py` | accounts, tickets, org |
| `ticket_base_qs()` — relations + `has_feedback` | `apps/tickets/scope.py` | the scoped list and the detail view |
| `compute_due_dates()`, `q_overdue()`, `q_at_risk()`, `q_met()` | `apps/sla/clock.py` | creation, reopen, analytics, check_sla |
| `created_window()` / `resolved_window()` / `resolution_seconds()` | `apps/analytics/services.py` | `aggregate()`, `insights`, `report_views` |

`test_no_module_writes_the_status_list_out_by_hand` enforces the first row: it
greps `apps/` for the literal and fails on a copy.
`test_no_module_writes_the_overdue_predicate_out_by_hand` does the same for the
SLA predicates. The rest rely on review; a second definition of any of them is
a bug, not a style preference.
