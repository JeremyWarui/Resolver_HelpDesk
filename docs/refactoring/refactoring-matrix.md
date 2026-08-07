# Refactoring Matrix

Module-level decisions. File-level detail lives in `docs/migration/`.

A note on the original brief's matrix: it listed "Leave Cover", "HR Services",
"ICT Services", "Procurement" and "Departments" as modules to remove. None of
those are modules. `django_resolver` has nine Django apps — accounts, org,
tickets, catalog, sla, facilities, analytics, common, realtime — and departments
are **rows in `org.Department`**. Grepping the codebase for "ICT" or "Procurement"
returns two docstring comments. Almost all of the "removal" in this project is
seed data and frontend surface, not backend modules.

## Backend

| Module | Keep | Modify | Merge | Remove | Notes |
|---|:--:|:--:|:--:|:--:|---|
| `facilities` | ✅ | | | | Highest-value carry-over. `validators.py` `TYPE_SPECS` (office_block, building, equipment, residential, grounds) is already a maintenance location vocabulary. Derived `status` = maintenance/operational is a free facility-health feature. |
| `sla` | | ✅ | | | `Priority` / `EscalationRule` / `due_dates` unchanged. `escalation.py` loses 30 of 47 lines with cover removal. `run_escalations.py` is a duplicate command — remove. |
| `tickets` | | ✅ | | | `Ticket.sub_section` FK; `scope.py` loses 44 of 144 lines; `routing.py` traversal collapses to a direct FK compare. Lifecycle, attachments, sequence, log immutability all unchanged. |
| `org` | | ✅ | | | **New `SubSection` model.** `SectionTechnician` gains `sub_section` + `unique(user, section, sub_section)`. `Section.clean()` R2 guard is load-bearing — keep. |
| `catalog` | | | ✅ | | `ServiceCategory` removed, folded into `org.SubSection`. `ServiceItem` moves to `apps.org`. App deleted. |
| `accounts` | | ✅ | | | ~40% dies with role cover. `RoleAssignment` → 1:1 with user. `SwitchRoleView` (84 LOC), `UserRoleAssignmentDetailView`, `resolve_active_assignment`, `available_roles` all removed. |
| `analytics` | | ✅ | | | Engine survives intact — every `aggregate()` predicate is a direct Ticket column. `service_category` dimension → `sub_section`; `department`, `campus_department`, `section_type` dimensions removed (one row each). |
| `common` | | ✅ | | | `time_windows.py` removed. Three of four seed commands removed; `seed_reference.py` ports as-is. |
| `realtime` | | ✅ | | | Split: `Notification` + REST kept (as `apps/notifications`); WebSockets deferred; web push removed. |
| Role cover | | | | ✅ | Absence handled organisationally. |
| Role switching | | | | ✅ | One role per user. |
| Web push | | | | ✅ | VAPID + HTTPS + key rotation for a browser toast. |
| Multi-department seeds | | | | ✅ | `seed_org`, `seed_demo`, `seed_full` replaced by one `seed.py`. |
| All migrations | | | | ✅ | Regenerated from scratch — fresh schema, no legacy backfill. |

## Frontend

| Module | Keep | Modify | Merge | Remove | Notes |
|---|:--:|:--:|:--:|:--:|---|
| Design system | ✅ | | | | `index.css`, `tailwind.config.ts`, `components.json`, `index.html` fonts, `public/`, all 29 `components/ui` primitives — **byte-for-byte**. |
| Layout shell | | ✅ | | | `RoleLayout`, `RoleDashboardLayout`, `PageHeader` as-is; `AppSidebar` nav maps edited. `MainLayout.tsx` is a 0-byte file — remove. |
| `DataTable/*`, `StatCards/*` | ✅ | | | | 1,841 LOC, no org assumptions. |
| Shared role views | | ✅ | | | `RoleDashboardView`, `RoleAnalyticsView`, `RoleReportsPage`, `RoleTicketsPage` — `group_by` and copy changes only. |
| `TicketCreationWizard` | | ✅ | | | Department sub-step → 5-tile sub-section picker, reusing the facility-type tile grid already in the file. Riskiest edit: `location_details` ownership moves off the deleted category. |
| Admin — Facilities | ✅ | | | | Most on-target admin page in the app. |
| Admin — Catalogue | | ✅ | | | 3-level Department→SectionType→Category browser collapses to SubSection→ServiceItem. |
| Admin — Sections | | ✅ | | | Repurposed as the SubSections admin. |
| Admin — Technicians | | ✅ | | | Existing specialty-tagging UI becomes sub-section assignment. |
| Admin — Users | | ✅ | | | `RoleAssignmentModal` (204 LOC, the cover UI) removed. |
| Admin — Departments | | | | ✅ | 620 LOC. ⚠️ Also the **only** HOD-assignment UI — must be rehomed onto Campuses or SubSections. Easiest thing to lose in the port. |
| Role switcher | | | | ✅ | API/hook plumbing only (`roleContext.tsx:85-106`, `authStore.ts:67-73`) — no UI renders it. Surgical removal. |
| Mobile PWA | ✅ | | | | Kept — field technicians are the audience. `PushSubscriptionManager` removed with the push backend. |
| Feedback | | ✅ | | | Already role-scoped (`FeedbackTab.tsx`, `useFeedback`, `RatingWidget`, nav entries for all four roles). Ports as the module's seed; the gap is charts on top. |
| Per-role duplicates | | | | ✅ | 5 `features/manager/*` components + 2 re-export shims, all with 0 importers. |
| Orphaned components | | | | ✅ | ~1,900 LOC with 0 importers: `forms/{FilterPanel,UserSelector,DynamicFormRenderer,TechnicianPicker,TechnicianSelect,SearchBar}`, `FacilityTypeForms/*` (the wizard inlines all five), `MagicLinkHandler`, duplicate `useDepartments` hooks, `utils/cn.ts`. |

## Tests

| Group | Count | Decision |
|---|---:|---|
| Port as-is | 198 | Port the scope/IDOR safety net **first**, before any model work. |
| Modify | 85 | Mostly fixture-graph changes once `conftest.py` exists. |
| Remove | 45 | Cover windows, role switching, cross-department boundaries, `ServiceCategory`. |
| New | +31 | 9 sub-section scope negatives, 7 structural invariants, 4 removed-surface guards, 5 catalogue/routing, 3 WS, 3 misc. |

Structural changes:

- **Add `conftest.py` and `factories.py`** — neither exists today. 139 fixture
  definitions across 13 files (`campus` declared 12×, `dept` 10×, `service_item` 8×);
  `make_user`/`make_ticket` are byte-identical in two files. ~700 lines of pure
  duplication, and adding SubSection to the fixture graph today means editing 13 files.
- **Rename `test_phase*.py` to behaviour** — `test_scope.py`, `test_ticket_lifecycle.py`,
  `test_claim.py`, `test_escalation.py`, `test_catalogue.py`, `test_sequence.py`,
  `test_analytics.py`, `test_auth.py`, `test_realtime.py`, `test_facilities.py`.
  The phase scheme already broke down — three files were named behaviourally
  because it had nothing to offer them.
- **Parametrise scope boundaries over the endpoint.** Four boundaries are asserted
  twice, once on `/tickets/` and once on `/analytics/flow/` (~250 LOC). Both call
  the same `scoped_ticket_qs`. Parametrising collapses them *and* increases
  coverage, since every boundary then runs on every surface.

### False-confidence tests — the ones that matter

Tests that stay green while proving nothing after the refactor:

1. `test_ticket_action_scope.py:137-163` ⚠️⚠️⚠️ — all three "outsider" fixtures are
   out of scope by **section and campus**. Six tests × three actors = **18
   assertions that cannot see the sub-section boundary at all**. This file is the
   designated safety net for exactly this refactor. A fourth param — a Carpentry
   technician holding a Plumbing ticket in their *own* section — must land before
   any model code.
2. `test_phase2.py:377` — the C15 `?department=` filter tests. With one department,
   the filter could be deleted entirely and they would still pass.
3. `test_phase7.py:1365` — asserts a `department` group-by dimension that will
   return exactly one bucket: a chart that renders, reconciles, and means nothing.
4. `test_phase1_models.py:341` — the D12 field-shape guard won't notice
   `Ticket.sub_section` was added.
5. `test_phase6_ws.py:124-139` — asserts the broken channel guard as correct.
6. `test_ticket_sequence.py:132` — partitions on a second department that cannot
   exist; the real partition key becomes campus.
