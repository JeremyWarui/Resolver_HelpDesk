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
