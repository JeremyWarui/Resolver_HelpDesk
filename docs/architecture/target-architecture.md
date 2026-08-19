# Architecture — Resolver HelpDesk

Status: **as built**. Supersedes the enterprise Service Desk design inherited
from `django_resolver`.

Where this document and the code disagree, the code is right and this is a bug
— say so in the same commit that fixes it.

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

`RoleAssignment` collapses to **one row per user** (`OneToOneField`). Removed:
`is_primary`, `valid_from`, `valid_until`, `is_active()`, `is_demoted()`, the
`one_primary_role_per_user` partial index, `SwitchRoleView`, `available_roles`, and
`apps/common/time_windows.py`.

Role cover is gone. Absence is handled organisationally, not in software. **Only
admin assigns roles** — HOD loses the role-assignment capability it had.

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
displaces the first. `_sync_org_scope` used to update only the right-hand
column, which left the displaced person:

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
- `analytics.aggregate()` may only touch direct `Ticket` columns (join fan-out
  there previously caused 500s and timeouts on Neon), and per-trade breakdown is
  the headline dimension of this system.

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

## 6. Deferred and dropped

**WebSockets deferred.** `Notification` + its REST endpoints are ported and read
over plain HTTP. Dropped: `channels`, `channels-redis`, `daphne`, `redis`,
`pywebpush`, `resolver/asgi.py`, Redis from the deploy — and on the frontend
`lib/ws/wsClient.ts` and `hooks/useWsChannels.ts`, which were otherwise opening
a socket against nothing and retrying with exponential backoff for the life of
the session.

Three reasons: a maintenance helpdesk runs on a minutes-to-hours cadence; WS forces
ASGI + Redis into the deploy for a low-volume single-department app, and silently
no-ops when the channel layer is missing; and the existing channel guard cannot
express sub-section scope (see §7).

**Web push dropped.** Needs HTTPS + VAPID key rotation for a browser toast, and its
notification helpers depend on the `is_primary` filters being deleted.

**Mobile PWA kept** — mobile ticket views and service-worker caching.
`PushSubscriptionManager` is dropped with the push backend, and the offline
action queue went later: nothing ever wrote to it. Both places that would have
(`MobileTicketDetail`'s status actions and its comment box) abort with "you are
offline" instead, so the queue only ever replayed an empty list.

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
(Electrical + Plumbing at Mombasa) is offered exactly those two of the section's
five. The page used to pass a `fetchSectionTickets: true` flag that the hook never
read — it looked like the thing keeping other trades out, and removing it changes
nothing. The cards above the table are labelled "In your trades at this campus"
for the same reason: they reuse the HOS aggregate, whose "All tickets in your
section" claimed a scope the technician does not have.

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

## 7. Inherited bugs — do not port

Found during the audit of `django_resolver`. **Still open** — these are live in
this codebase or deliberately reproduced in it. Anything fixed moves to the list
below rather than staying here struck through, so this list is only ever the
work remaining.

1. **WS channel guard has no ownership check** (`apps/realtime/consumers.py:100-115`,
   in the reference repo). `ticket_*` returns `True` for any authenticated user;
   `section_*` and `campus_department_*` check only the role *name*, so any
   technician can subscribe to any section's feed. `tests/test_phase6_ws.py:124-139`
   asserts this as correct. Deferring WS (§6) avoids inheriting it; a correct
   scheme needs groups keyed on `(section, sub_section)` with membership
   re-derived from `SectionTechnician` rather than a JWT claim.
2. **Tailwind config is inert.** `src/index.css:1` is `@import 'tailwindcss';` with
   no `@config`, so under Tailwind v4 + `@tailwindcss/vite` the config file is never
   loaded and `tailwindcss-animate` is never registered — every `animate-in` /
   `fade-in-0` / `zoom-in-95` class is a no-op and overlays snap open. Reproduced
   verbatim to preserve the current look; wiring it up would double-wrap the
   already-`oklch()` tokens and break every colour. Tech debt, recorded not fixed.

### Fixed since

- **Frontend posted a backend field that did not exist.** `SectionTypeForm.tsx`
  and `organizations.ts` sent `parent` / `specialty_ids` for a "specialty within
  a section type" feature that exists nowhere in the Python; DRF discarded it
  silently. The UI was reused for SubSection admin, which is the feature it was
  reaching for.
- **`check_sla.py` emitted to WS groups no consumer joins** — dead code, removed.
- **`report_views.py` parsed dates naive under `USE_TZ=True`**, which also made
  the Summary sheet disagree with the data sheets. Both parsers are now
  `_build_date_range_params` + `resolve_date_range`.
- **`process_auto_escalations --verbose`** was declared and never read; removed.
- **`routing.py` picked a section with `.first()` and no `order_by`** —
  nondeterministic had a campus ever had two matching active sections. It now
  orders by `pk`, with a comment saying why. (Fixed in `6bdf179`; this list had
  not caught up.)
- **`process_auto_escalations --dry-run` reported nothing.** It printed a
  warning and returned. It now runs the real path inside a rolled-back
  transaction and reports the count, so the preview cannot drift from the run
  it predicts. Both halves of the command have tests; the sibling `check_sla`
  had one and this did not.
- **Four read paths were duplicated and had already drifted.**
  `TicketDetailView` kept a hand-written `select_related` that had lost
  `sub_section` and never applied the `has_feedback` annotation, so every
  detail read paid for both; `DepartmentViewSet` and `SectionTypeViewSet`
  declared `prefetch_related` and then had it thrown away by serializers that
  built fresh querysets. All now go through `ticket_base_qs()` / `Prefetch()`,
  with query-count tests (`test_ticket_read_queries.py`,
  `test_org_catalogue_queries.py`) — a count is the only thing that sees this.
- **`TicketFeedbackView` skipped the IDOR guard**, fetching with a bare
  `get_object_or_404`. Safe only because the next line rejected non-requesters.
  It uses `get_ticket_for_request_or_403` and is in the OUTSIDERS matrix now.
- **`TicketAssignView` mutated the Ticket directly**, the only action view that
  did. Moved to `lifecycle.assign_ticket()`.
- **Dead config and fields, removed.** `role_config`'s `headline`,
  `facilities`, `ticket_flow` and `comparison` keys were read by nothing — the
  frontend keeps its own copy of that shape. `get_primary_campus_display` was
  character-for-character `get_campus_name`, and neither `*_display` field was
  read anywhere in the client. `_SectionMinSerializer` emitted
  `section_type_name` and `name` from one source. `rest_framework.authtoken`
  was installed under JWT-only auth.
- **`report_views.py` had no test at all** — 653 lines of workbook building.
  `tests/test_reports.py` covers every report type, the Summary agreeing with
  the analytics endpoint, and a cross-campus negative.
- **Manager was the last role on the older ticket-table stack.** Admin, HOD
  and HOS render `RoleTicketsPage`; manager wired `DataTable` +
  `createTicketTableColumns` by hand, while `RoleTicketsPage` already held a
  complete `manager` entry nothing called. The user-visible cost was the
  `FilterPills` row: managers had no **Overdue** filter, the one every other
  supervisory role gets. `e2e/manager.spec.ts` now asserts the page renders and
  the pill narrows.
- **`useTicketTable` carried a third of itself for nobody.** Six config options
  (`externalSections/Users/Technicians/Facilities`, `initialData`,
  `onDataFetched`) had no call site, which made `technicians` and `users`
  permanently `[]` — so `createTicketTableFilters`' technician and requester
  dropdowns could only ever offer "All", and the `raisedByName` lookup searched
  an empty array for a value nothing read. `unassignedFilter` was state that
  never reached `ticketParams`, the same defect as the Overdue pill. Worst of
  it: the hook called `useSections()` and an unfiltered `useFacilities()` —
  the whole estate — on every mount of every ticket table, and no caller read
  either. 345 lines to 277, and two requests per table gone.
- **Three table headers were one table header.** `AdminTableHeader` and
  `TechTableHeader` differed from the default by one CSS class each and neither
  rendered `subtitle`; that retires `DataTable`'s `renderHeader` escape hatch
  with its last two consumers. The sortable-header block was hand-inlined in
  five `TableUtils` columns beside `useSortableColumn`, which already existed
  and which three admin pages already used — now `sortableHeader`, named for
  what it is, since it returns a component and is called from plain factories.
- **Four small vocabularies had two definitions each.** `timeAgo` had a fourth
  copy in `NotificationItem` (that copy contributed the "Just now" branch,
  which is better than the "0m ago" the shared one rendered — so it was kept
  and the copy deleted). `BadgeColor` was declared three times and had already
  drifted: the canonical export carried an `'orange'` nothing produces, the two
  local copies did not. The JWT base64url decode was written twice with the same
  swallowed catch, now `decodeJwtPayload`. The role → base-path map lived in
  `AppSidebar` as `ROLE_BASE` and in `LoginForm` as `roleRedirect`; renaming a
  prefix would have landed a signed-in user on a 404 while the sidebar kept
  working. `App.tsx` still spells its routes literally, deliberately.
- **~1,200 lines of dead frontend code, removed.** The bulk of it was code
  that could not run rather than code nobody called: 30 `export default`s no
  importer used (only `useTickets` was imported both ways, which is the drift
  the pattern invites), the whole `section` branch of `UnifiedDetailsSheet`
  and its config entry — both callers are typed to `facility` or `technician`,
  so its roster fetch, `related-list` field type and loading skeleton were
  unreachable — `SECTION_OVERVIEW_STATS` and `STAT_DEFINITIONS` (reachable
  only through a `STAT_VIEWS` key nothing reads), four of five schemas in
  `ticketValidation`, `ChartLegend`/`ChartLegendContent`, the `UserDashboard`
  type chain, `hod.types.ts`, `manager.types.ts`, `useCreateTicket`,
  `useTicketFilters`, seven single-fetch service methods, and the `uiStore`
  modal slice. `AdminRoute`/`TechnicianRoute`/`UserRoute` went too: besides
  having no callers, `UserRoute` required `role === 'user'`, which would have
  locked five roles out of raising tickets (invariant 5) had anyone reached
  for it.
  Nine unused runtime dependencies went with it. `progress.tsx` and
  `@radix-ui/react-progress` were live only for the simulated upload bar.
  **What was deliberately kept:** types exported but only used inside their own
  file (they document the API shape), the shadcn re-exports, and
  `REPORTS_STYLING_GUIDE.md`, which is current and moved to `docs/` rather
  than deleted — it sat under `features/reports/`, a directory with no code in
  it.
- **Five destructive confirmations, five implementations.** `ConfirmDialog`'s
  own header claimed it was "used by every action that cannot be undone" while
  having exactly one consumer. Users, Departments, SLA priorities and the
  service Catalogue had each rebuilt the same title/description/cancel/confirm
  AlertDialog by hand (the Catalogue's in a file of its own,
  `DeleteConfirmDialog.tsx`), and Campuses used a raw `window.confirm` — a
  native modal in an app that renders its own, with no loading state, so a slow
  DELETE looked like nothing had happened. All five now call `ConfirmDialog`;
  `title` and `description` take a `ReactNode` because some of them format the
  entity name into the sentence or put an icon in the title. `alert-dialog` has
  one importer again, and `grep window.confirm src/` returns only a comment.
  Departments and SLA priorities have no E2E coverage — those two were verified
  by types and build only.
- **The my-tickets Actions cell read a detail-only field.** `rateAndCloseColumn`
  tested `ticket.feedback`, which only `TicketDetailReadSerializer` nests; the
  list sends `has_feedback`. The test was therefore always `undefined`. It is
  *not* the "rated tickets keep offering Rate & close" bug it looks like —
  `RatingModal` posts feedback and then closes the ticket, so a rated row is
  `closed` and fails the `resolved` test either way. It bites when the close
  after the feedback fails (the modal's `catch` swallows it): the ticket stays
  resolved and rated, the button is offered again, and the endpoint answers
  409 "Feedback has already been submitted." Both branches key on
  `has_feedback` now, and `Ticket` says which of the two fields a list row
  carries.
- **Two details-sheet saves reported success and wrote nothing.** The facility
  branch of `handleSaveChanges` was an empty `// TODO` and fell through to
  `toast.success('Facility updated successfully')`, so the admin saw a save
  that never happened and the list refetched the old values. It now calls
  `facilitiesService.updateFacility`, over the writable half only — the config
  had been offering `type` and `status` (read-only) and `location` (not a
  column). The technician sheet had a full add/remove section picker whose
  save sent `{email}` alone; the comment beside it already said the server has
  never read `sections` off that endpoint. Section membership is a role
  assignment and belongs to `TechnicianForm`, so the picker and its three
  handlers are gone rather than given a new backend surface.
- **Technician sections rendered as a run of digits.** The same config listed
  `sections` as a `readonly` view field, so it fell past the branch that maps
  ids to names and React concatenated the array — a technician in sections 3
  and 7 read "37", and an unassigned one showed blank rather than an em dash,
  since `[] || '—'` is truthy. Typed `sections` now, which is what the
  already-written `technicianSectionNames` was waiting for.
- **"New Facility" could never create a facility.** The dialog collected
  `facility_code`, `type`, `status` and `location` and posted them: of those,
  the real field name is `code`, `type` and `status` are read-only
  `SerializerMethodField`s, and `location` is not a column. `facility_type` —
  the one required FK, which has no default — was never sent, so every submit
  answered `400 {"facility_type": ["This field is required."]}` behind a
  generic "Failed to create facility". The payload type simply described a
  different API than the one being called, so `tsc` was green. The form now
  reads `GET /facility-types/` (registered since the port and never called
  until now) and sends the FK. `e2e/facilities.spec.ts` drives the dialog and
  asserts 201 — it fails with the original 400 if the field is dropped again.
- **`Facility` described fields the API has never sent.** `facility_code` and
  `floors_count` were declared; `code`, `facility_type`, `facility_type_name`
  and the three ticket counts, which the serializer always returns, were not.
  `FacilityRegisterView` had quietly re-declared the missing half locally as
  `FacilityRow`. The type now mirrors `FacilitySerializer.Meta.fields` and the
  local copy is gone.
- **Attachments were never uploaded.** `AttachmentUploader` made no network
  call at all: `simulateProgress()` advanced a bar on a `setTimeout` until it
  read 100% and flipped the row to `done`, and the wizard's payload had no
  attachment field. A requester photographed a fault, watched the bar fill, saw
  the file on the review step, submitted — and the bytes never left the browser.
  The endpoint, the compression service and the model had been built all along;
  only the call was missing. The wizard now posts to
  `/tickets/<id>/attachments/` after create (there is no id to post to before
  it), and reports a ticket-created-but-upload-failed partial rather than a
  failed submission the user would retry into a duplicate. Per-file progress is
  gone rather than made real — one request carries the batch, so a per-file bar
  would be a second invented number. `tests/test_attachments.py` covers the
  field name, both caps, the type rejection and uploader-or-supervisor delete;
  `ticket-lifecycle` attaches a real PNG and asserts the technician sees it.
- **Uploads had nowhere to land in the UI.** Nothing rendered attachments on a
  ticket, so wiring the upload alone would have moved the bug rather than fixed
  it. `TicketDetailPage` now has an Attachments card, fed by
  `useTicketAttachments`, and `useTicketInvalidate` clears that key too.
- **The Overdue pill listed every ticket.** `overdueFilter` was held in
  `useTicketTable` state, read back only to light the pill, and applied
  nowhere — and the handler set `status` to `all` alongside it, so "Overdue"
  widened the table instead of narrowing it, resolved rows included. It is now
  `?overdue=1` on the list endpoint, server-side like every other filter
  (client-side would filter the 20 rows the page happens to hold), using the
  same predicate as analytics' `breached`: RUNNING_STATUSES past
  `resolution_due_at`. The pill and the SLA Tracking card now both say 25.

## 7a. Keeping the two halves in step

Frontend code can call an endpoint that does not exist and still compile, build
and pass lint. That is the failure mode this port kept hitting, and the first
sign of it is a 404 in front of a user.

The check is mechanical — extract every `apiClient.<verb>('…')` path, extract
every Django route, diff them. Doing it once found six unmatched calls: five
dead (push, `/admin/config/`, `/auth/profile/`, `assign-hos`) and one live —
`GET /tickets/feedback/`, which four roles' Feedback tab was calling and which
had never been ported. Worth re-running after any batch of endpoint changes.

**There is one API mount.** `/api/v1/` is it. `apps.accounts.urls` used to be
included a second time at bare `/api/` "for backward compatibility", so every
auth and user endpoint answered on two paths — a second, unwatched copy of the
login surface that nothing in this repo called. Both mounts shared URL names, so
`reverse()` silently resolved to the v1 copy and the duplicate was invisible from
inside the code. Removed; if a path outside `/api/v1/` ever answers again, that
is the bug.

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

Run it with `E2E_PASSWORD=<seed password> npm run test:e2e`. Both servers start
automatically; the backend command points at **`../backend`**, which is worth
checking if the suite ever starts behaving like a different application — it
pointed at the reference repo for the whole first part of this port, so the
suite was testing the enterprise Service Desk.

## 8. Target app layout

```
apps/
  common/      roles, permissions, pagination, phone, admin, seed
                                                           (no time_windows)
  accounts/    CustomUser, UserProfile, RoleAssignment(1:1)  (no switch-role)
  org/         Campus, Department, CampusDepartment, SectionType,
               SubSection, Section, SectionTechnician, ServiceItem
  sla/         Priority, EscalationRule, due_dates, escalation
  facilities/  FacilityType, Facility, validators            (unchanged)
  tickets/     Ticket, Location, Log, Comment, Feedback, Attachment,
               Sequence; scope / routing / lifecycle / attachments
  analytics/   services, insights, role_config, views, report_views
  notifications/  Notification model + REST                  (ex-realtime slice)
```

9 apps → 8. 24 models → 23.

### Where the shared vocabularies live

A value repeated across modules gets exactly one definition, because every one
of them has drifted here at least once:

| Definition | Home | Read by |
|---|---|---|
| `ACTIVE/RUNNING/TERMINAL_STATUSES`, `ESCALATED_LEVELS` | `apps/tickets/statuses.py` | tickets, sla, analytics, facilities, common |
| `SUPERVISOR_ROLES`, `STAFF_ROLES` | `apps/common/roles.py` | tickets, analytics |
| `PENDING_REASONS` | `apps/tickets/pending_reasons.py` | model choices, lifecycle, analytics, the API |
| `ticket_base_qs()` — relations + `has_feedback` | `apps/tickets/services/scope.py` | the scoped list and the detail view |
| `compute_due_dates()` | `apps/sla/services/due_dates.py` | creation, reopen, assignment, the seed |
| `created_window()` / `resolved_window()` / `resolution_seconds()` | `apps/analytics/services.py` | `aggregate()`, `insights`, `report_views` |

`test_no_module_writes_the_status_list_out_by_hand` is the enforcement for the
first row; it greps `apps/` for the literal and fails on a copy. The others
rely on review — a second definition of any of them is a bug, not a style
preference.
