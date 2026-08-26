# CLAUDE.md

> **Kenya School of Government — Maintenance Helpdesk** · Django 6.0 · DRF 3.16 · PostgreSQL · React + TS + Vite
> SOT: `docs/architecture/target-architecture.md` — **as-built**. If it disagrees with the code, the code wins and the doc is a bug; fix it in the same commit.

One department (Administration), one section type (Maintenance), five trades,
five campuses. Not a generic Service Desk.

**Response style: be terse.** Don't restate code you just wrote, don't echo file
contents back, don't end with summaries unless asked.

## Commands

```bash
# Backend (from backend/) — the interpreter is ../venv/Scripts/python on Windows
SECRET_KEY=dev-only-not-a-secret ../venv/Scripts/python -m pytest -q --no-cov -p no:cacheprovider
../venv/Scripts/python manage.py makemigrations && ../venv/Scripts/python manage.py migrate
SEED_DEFAULT_PASSWORD='<demo password>' ../venv/Scripts/python manage.py seed   # idempotent; --no-demo for structure only

# makemigrations with no database configured:
../venv/Scripts/python manage.py makemigrations --settings=resolver.test_settings

# Frontend (from frontend/)
npx tsc -b --noEmit     # the fast check — run it after any type or API change
npm run build
npm run dev
E2E_PASSWORD='<seed password>' npm run test:e2e   # Playwright; starts both servers
```

Tests run on in-memory SQLite (`resolver/test_settings.py`), so the suite never
touches a real database. The app runs on local PostgreSQL; copy
`backend/.env.example` to `backend/.env`.

`seed` refuses to run without `SEED_DEFAULT_PASSWORD`. It seeds 5 campuses, 5
trades, 28 service items, 37 facilities, 6 facility types, 39 users and 45 demo
tickets over two weeks. Deterministic (`random.Random(20260808)`). Seeded
accounts follow the email rule like any other (`first.last@ksg.ac.ke`, username
derived from it), so the command ends by printing one login per role — the
address does not say who is what.

## Architecture

`apps/<domain>/` — common, accounts, org, sla, facilities, tickets, analytics,
notifications. Routing: `resolver/urls.py` → `api_urls.py` → `apps/<app>/urls.py`
→ views → **services** → models. Views never mutate a Ticket directly; always
through a service (`transition_status`, `claim_ticket`).

No app has a `services/` subpackage. A service module sits directly in its app:
`tickets/{constants,scope,lifecycle,attachments}.py`, `sla/{clock,escalation}.py`,
`accounts/{identity,scope,posts}.py`.

Every module's docstring carries a **Used by** list naming the app modules that
import it. It states the current code, so update it when an importer changes.
Derive it by reference-counting the AST, not by reading comments.

The docstring also opens with a **Contents** index — one line per model,
function or property, saying its purpose and, where it is not obvious, why.
That index is where a reader looks first, so per-function docstrings and `#`
comments carry only what the index cannot: the why behind a line, a return
shape, a trap. A comment that restates the code or the index gets deleted.
Converted so far: accounts.

Frontend: `features/<role>/` pages, shared role-parametrised views in
`features/shared/`, self-fetching scoped data components in
`components/shared/data/`. Extend those rather than re-implementing per role.

### Scope enforcement (the critical path)

All reads go through `scoped_ticket_qs(user, role)` in `apps/tickets/scope.py`.
Scope derives server-side from the JWT role claim — **never from client params**
— and fails closed.

The technician branch is the dangerous one, because its scope is
two-dimensional (campus AND trade) and the two dimensions fail differently:

```python
# WRONG — cross product. A technician who is Carpentry@Nairobi and
# Plumbing@Mombasa would also match Plumbing@Nairobi and Carpentry@Mombasa.
base.filter(section__in=section_ids, sub_section__in=sub_section_ids)

# CORRECT — pairwise. accounts.scope.technician_pair_exists
link = SectionTechnician.objects.filter(
    user=user, section_id=OuterRef("section_id"), sub_section_id=OuterRef("sub_section_id"))
return base.filter(Exists(link))
```

These agree for anyone assigned at a single campus, which is why the bug
survives casual testing. Every scope boundary needs a **negative** test, and a
multi-campus one — `test_multi_campus_technician_sees_only_assigned_pairs` is
the only test that catches this.

Filters narrow, never widen: `?sub_section=` applies *after* scoping, so an
out-of-scope id matches nothing rather than reaching past the caller.

## Key invariants

1. `RoleAssignment` is the role source of truth, **one row per user**
   (`OneToOneField`). No `is_primary`, no `valid_until`, no role switching, no
   cover — those fields are what would let time-boxed roles back in.
2. Ticket holds only intrinsic state; audit lives in `TicketLog`.
3. Paused (`pending`) tickets freeze the SLA timer and never count as
   breached or at-risk. `RUNNING_STATUSES`, not `ACTIVE_STATUSES`.
4. Escalation is structural (Technician → HOS → HOD), not configurable workflow.
5. Every user can raise tickets; routing derives from `service_item` +
   `requester_campus`, never from the requester's role.
6. Priority is a property of a ticket, not a service. Opens at Low; the HOS sets
   the real one at assignment.
7. Every ticket carries a location.
8. The email address is the identity. Login takes `{email, password}`; username,
   first and last name are derived from the local part in
   `apps/accounts/identity.py` and never taken from the client — not by
   registration, not by admin create. Changing a user's email renames the
   account; there is no way to set a name on its own.
9. `apps/accounts/posts.py::assign_role` is the only writer of a role. It writes
   `RoleAssignment` **and** the org FK (`Section.hos`,
   `CampusDepartment.head_of_department`, `Department.manager_user`,
   `SectionTechnician`) in one transaction. Writing one side alone produces a
   supervisor with the title, the dashboard and the JWT claim, and an empty
   ticket list.

## Gotchas

- **Lifecycle:** `ALLOWED` in `tickets/lifecycle.py` is the map. Reopen clears
  `assigned_to` and restarts the SLA (`open` ⇒ unassigned — claim relies on it).
  Claim drives `open → assigned → in_progress` in one action, both hops logged.
  Frontend mirror: `VALID_NEXT_STATUS` in `src/constants/tickets.ts`, read by
  `StatusUpdateModal.tsx` and `MobileTicketDetail.tsx` — keep in sync.
- **IDOR guard:** every `/tickets/{pk}/...` action view fetches via
  `get_ticket_for_request_or_403()`, never a bare `get_object_or_404`. A new
  sub-endpoint isn't done without an out-of-scope 403 test in
  `tests/test_ticket_action_scope.py`.
- **Analytics:** edit `apps/analytics/services.py::aggregate()`, not individual
  endpoints. Direct `Ticket` columns only — join fan-out multiplies rows and
  turns the aggregate into a timeout. Breakdown-only endpoints must **not** call
  `aggregate()`; use `breakdown()` or `technician_load()`.
- **Group by trade, never by section.** Maintenance is the only section type, so
  a section breakdown draws one bar for an HOD/HOS and one bar per campus for a
  manager — a restatement of the campus chart beside it. `role_config` already
  refuses `section` for hod/hos; charts, tables and filter dropdowns must follow
  (`/analytics/performance/trades/`, `tradeColumn`, `createTradeFilter`).
- **SLA: settled ≠ running.** A finished ticket's outcome is judged against
  `resolved_at`, never against the clock — comparing its due date to "now" marks
  every ticket ever closed as breached once that date passes. The UI splits the
  two names: **Overdue** = live and past target (matches `aggregate()`'s
  `breached`, which gates on `q_overdue`), **Missed** = settled late, computed
  in `SLATrackingView.tsx`. One card labelled "Breached" covering both makes SLA
  Tracking disagree with Analytics.
- **`TYPE_SPECS`** (`apps/facilities/validators.py`) is the location contract and
  is mirrored in `TicketCreationWizard.tsx::FACILITY_FORMS` (line 89), with the
  type codes in `src/constants/facilityTypes.ts`. Change all three in the same
  commit.
- **Reference-data query params must filter:** `?campus=` / `?department=` are
  wired in `get_queryset()` overrides. A new scoping param means the filter plus
  a negative test in the same commit.
- **Ticket numbers** come from `TicketSequence.allocate()` under
  `select_for_update`. Never parse `ticket_no` to make the next one. Gaps are fine.
- **Phone numbers** are Kenyan-only, stored E.164, normalised in
  `apps/common/phone.py` — the single definition of what a number is.
- **`has_feedback`** is an annotation. If you add a nested field to a read
  serializer, add it to `select_related` on *both* the scoped queryset and the
  `?mine=1` branch, or it silently becomes a query per row.
- **Frontend can call a dead endpoint and still compile.** After any batch of
  endpoint changes, diff `apiClient.<verb>('…')` paths against Django's routes,
  comparing trailing slashes **exactly**, since `APPEND_SLASH` turns a slashless
  POST into a 405.
- **A green `tsc` says nothing about what renders.** A mislabelled column, a dead
  quick-access card, an empty chart, a search box filtering on a property its
  rows lack — `tsc` is green for all of them. Run the Playwright suite after UI
  changes, and drive the page when adding one. `e2e/ticket-lifecycle.spec.ts` is
  the template: it asserts through the UI what the backend tests assert
  directly, including a scope negative.
- **Notifications are polled, not pushed.** `useNotifications()` is the single
  source; the emitters in `apps/notifications/notify.py` write the rows and are
  wrapped so they can never break the ticket update that triggered them.
- Frontend role checks (`useAuth().user.role`) are UI convenience only; the
  backend enforces scope.

No feature is complete without tests and an SOT update.
