# Target Architecture — Resolver HelpDesk

Status: agreed, pre-implementation. Supersedes the enterprise Service Desk design
inherited from `django_resolver`.

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

## 2. Catalogue

`catalog.ServiceCategory` is deleted. Its `location_details` field moves to
`org.SubSection`; `ServiceItem.category` becomes `ServiceItem.sub_section`.

**Priority leaves the catalogue entirely.** `ServiceCategory.default_priority`
and `ServiceItem.default_priority` are both gone. A ticket opens at the lowest
priority (`Priority.default()`) and the HOS sets the real one when they assign
it — see §5a.

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

`Ticket.sub_section` must be **non-nullable**, or the `Exists` never matches and
technicians silently see nothing.

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
1a  sub-section   Electrical │ Plumbing │ Carpentry │ Masonry │ Painting
1b  service item  Faulty socket │ Replace bulb │ Generator issue
2   description + attachments + location (gated by sub_section.location_details)
3   review + submit
```

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

`Ticket.sub_section` is denormalised deliberately: `analytics.aggregate()` may only
touch direct `Ticket` columns (join fan-out there previously caused 500s and
timeouts on Neon), and per-trade breakdown is the headline dimension of this system.

## 6. Deferred and dropped

**WebSockets deferred.** `Notification` + its REST endpoints are ported and the
frontend polls. Dropped: `channels`, `channels-redis`, `daphne`, `redis`,
`pywebpush`, `resolver/asgi.py`, and Redis from the deploy.

Three reasons: a maintenance helpdesk runs on a minutes-to-hours cadence; WS forces
ASGI + Redis into the deploy for a low-volume single-department app, and silently
no-ops when the channel layer is missing; and the existing channel guard cannot
express sub-section scope (see §7).

**Web push dropped.** Needs HTTPS + VAPID key rotation for a browser toast, and its
notification helpers depend on the `is_primary` filters being deleted.

**Mobile PWA kept** — offline queue, mobile ticket views, service-worker caching.
`PushSubscriptionManager` is dropped with the push backend.

## 7. Inherited bugs — do not port

Found during the audit of `django_resolver`. These exist in the reference
implementation today.

1. **WS channel guard has no ownership check** (`apps/realtime/consumers.py:100-115`).
   `ticket_*` returns `True` for any authenticated user; `section_*` and
   `campus_department_*` check only the role *name*, so any technician can subscribe
   to any section's feed. `tests/test_phase6_ws.py:124-139` asserts this as correct.
   Deferring WS avoids inheriting it; a correct scheme needs groups keyed on
   `(section, sub_section)` with membership re-derived from `SectionTechnician`
   rather than a JWT claim.
2. **Frontend posts a backend field that does not exist.** `SectionTypeForm.tsx`
   and `organizations.ts:175` send `parent` / `specialty_ids` for a
   "specialty within a section type" feature. `SectionType` has no `parent` field
   and `specialty` appears nowhere in the Python. DRF discards it silently. The
   **UI is reusable** for SubSection admin — the backend was never built.
3. **Tailwind config is inert.** `src/index.css:1` is `@import 'tailwindcss';` with
   no `@config`, so under Tailwind v4 + `@tailwindcss/vite` the config file is never
   loaded and `tailwindcss-animate` is never registered — every `animate-in` /
   `fade-in-0` / `zoom-in-95` class is a no-op and overlays snap open. Reproduced
   verbatim to preserve the current look; wiring it up would double-wrap the
   already-`oklch()` tokens and break every colour. Tech debt, recorded not fixed.
4. `check_sla.py:96-101` emits to WS groups no consumer joins — dead code.
5. `process_auto_escalations --dry-run` returns without reporting what would change;
   `--verbose` is declared and never read.
6. `report_views.py:96-97` parses dates naive under `USE_TZ=True`.
7. `routing.py:27` uses `.first()` with no `order_by` — nondeterministic if a campus
   ever has two matching active sections.

## 8. Target app layout

```
apps/
  common/      roles, permissions, pagination, admin, seed   (no time_windows)
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

9 apps → 8. 24 models → ~20.
