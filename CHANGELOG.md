# Changelog

All notable changes to Resolver HelpDesk are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project does not yet version releases.

## [Unreleased]

### Added

- **Phase 1 — Project setup.** Created the `Resolver_HelpDesk` project skeleton
  (`backend/`, `frontend/`, `docs/{architecture,migration,refactoring,future}/`),
  root `README.md`, `CHANGELOG.md` and `.gitignore`.
- Copied the reference backend from `portfolio/django_resolver` into `backend/`
  and the reference frontend from `portfolio/Resolver/client` into `frontend/`,
  verbatim — no code, model or configuration changes. Dependency trees, build
  output, caches and the original `.git` histories were excluded.

### Changed — the port

- **Catalogue lost a level.** `ServiceCategory` folded into `SubSection`, which
  is also the technician scoping boundary, so there is one concept where there
  were two. `SectionType` lost its parent/child specialty hierarchy with it.
- **Priority left the catalogue.** A ticket opens at Low and the HOS sets the
  real one when they assign it, from a control placed above the technician list
  — urgency decides who can realistically take the job, so it is chosen first.
  Changing it re-times the SLA from `created_at`, not from the assignment.
- **Roles collapsed to one per user** (`OneToOneField`). No `is_primary`, no
  validity window, no cover, no role switching. Only an admin assigns roles.
- **Technician scope became two-dimensional** — campus *and* trade, matched
  pairwise via `Exists` on `SectionTechnician`. The cross-product form agrees
  for anyone at a single campus, so only a multi-campus test catches the bug.
- **Every ticket carries a location.** `SubSection.location_details` was a
  boolean that could not be false and is gone. Nine facility types became six;
  `building` absorbed conference facilities, dining halls and recreational
  blocks, and staff quarters now require the tenant rather than the unit number.
- **Optional contact number per ticket**, Kenyan-only and stored E.164, shown on
  the detail view only. Captured on the ticket rather than read from the profile:
  the useful number is often not the requester's, and a profile edit must not
  rewrite the history of a closed job.
- **Requester dashboard rebuilt** — a full-width row of the maintenance services
  their campus offers, recent activity below, and a rating prompt that appears
  only when resolved tickets are actually waiting on them.

### Changed — reports

- **One reports page for all five roles.** `RoleReportsPage` drives its tabs from
  a `ROLE_COPY` table rather than JSX conditionals; the technician's separate
  page and its own report component were deleted in favour of a row in that
  table plus `MyPerformancePanel`, their own numbers ordered by what they can
  act on.
- **Section and Campus performance merged** into one
  `PerformanceBreakdownReport` taking a `dimension` prop — two files, 262 and
  259 lines, that differed on 29 of them.
- **Section Analysis removed for every role.** A Section is a campus × section
  type, and Maintenance is the only section type, so it drew the same five rows
  as Campus Performance from a second endpoint with worse labels. Admin and
  manager now get identical tab lists — both scopes resolve to the whole
  organisation — where admin previously had Section Analysis but not Campus
  Performance, leaving the one role that can see every campus without the
  per-campus view. Only the tab went: the `section` dimension, its hook and its
  endpoint all remain, so a second section type restores the split without new
  plumbing.
- Chart tooltips (ten definitions across seven files) and the chart palette
  (five copies) each collapsed to one definition.

### Changed — e2e

- **The suite was booting the wrong application.** `playwright.config.ts` started
  its backend from `../../django_resolver`, the reference repo, so
  `npm run test:e2e` tested the enterprise Service Desk. Now `../backend`.
- **Catalogue spec rewritten** for the shape this app actually has: Section Type
  → **Trade** → Service Item, where it drove Section Type → Service Category, a
  model deleted in the port. It could never have passed here.
- **New `ticket-lifecycle` spec** — the path the product exists to serve, and
  the one with no coverage: a requester raises a ticket through the wizard with
  an office-block location, it routes to the plumbing technician at that campus,
  who claims it (`open → assigned → in_progress` in one action) and resolves it,
  and the requester sees it resolved. Ends on a negative: a technician on the
  same campus but a different trade cannot see it — the case that fails if scope
  is ever reduced to campus alone.
- One login helper for every seeded role, taking a single `E2E_PASSWORD`.

### Removed

- WebSockets, Channels, Daphne, Redis, web push, and the frontend WS client and
  channel hook that were opening a socket against nothing.
- `/auth/switch-role/`, `available_roles`, the cover-assignment modal, technician
  specialty tagging, `/admin/config/`, `/auth/profile/`, and the `assign-hos`
  action — all called from the frontend, none of them backed by a view.

### Fixed

- `GET /tickets/feedback/` was never ported, so the Feedback tab 404'd for
  technicians, HOS, HODs and managers. Added, scoped through
  `scoped_ticket_qs` rather than a second rule that could drift from it.
- Comments returned 500 — a WS emit survived the Channels removal.
- Paused tickets counted as breached in three of the four places that computed
  it, so a ticket's own badge contradicted the dashboard (R9).
- A malformed contact number was silently swallowed and replaced with the
  requester's own, so a mistyped caretaker number would have sent the technician
  to call the wrong person.
- An N+1 on the ticket list: adding `sub_section` to the read serializer left
  the `?mine=1` branch's `select_related` behind.
- Four report bugs that only a rendered page showed, the typecheck being green
  throughout: dead quick-access cards pointing at tabs their role did not have,
  an empty chart, a tab that could only ever draw one row, and a technician
  table column headed "Pending" that rendered `escalated_count` — there is no
  `pending_count` on the row. It survived because the mislabelled table lived on
  a different page from the correct one, so the two were never read together.
- The notification bell had no writer left after the WebSocket removal; the
  emitters now write rows and are wrapped so they cannot break the ticket update
  that triggered them.
- `check_sla` raised `ImportError` on every run — it still imported the deleted
  `emit_ws_event`. A test now imports every management command.
- **Ticket search emptied the table instead of searching it** wherever
  `TicketTable` was used directly — My Tickets, the requester dashboard, the
  admin ticket list, SLA tracking. The search box filters a hidden `searchField`
  column, and only tables built through `useTicketTable` had that property on
  their rows; everywhere else the accessor read `undefined`, so any query
  matched nothing. `searchField` is an extra property, so TypeScript never had
  an opinion, and the technician queue searching correctly is what made it look
  fine. Now derived inside `TicketTable`, from ticket number, service item and
  description — the columns the box claims to search.
