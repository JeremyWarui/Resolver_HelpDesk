# CLAUDE.md

> **Kenya School of Government — Maintenance Helpdesk** · Django 6.0 · DRF 3.16 · PostgreSQL · React + TS + Vite
> SOT: `docs/architecture/target-architecture.md` — **as-built**. If it disagrees with the code, the code wins and the doc is a bug; fix it in the same commit.

One department (Administration), one section type (Maintenance), five trades,
five campuses. Not a generic Service Desk — the enterprise version it was ported
from lives at `/home/jeremy/Desktop/portfolio/django_resolver` and
`/home/jeremy/Desktop/portfolio/Resolver/client`, both **untouched** reference
implementations. Prefer reuse over rewriting; remove what this scope doesn't need.

**Response style: be terse.** Don't restate code you just wrote, don't echo file
contents back, don't end with summaries unless asked.

## Commands

```bash
# Backend (from backend/)
SECRET_KEY=dev-only-not-a-secret ../.venv/bin/python -m pytest -q --no-cov -p no:cacheprovider
../.venv/bin/python manage.py makemigrations && ../.venv/bin/python manage.py migrate
SEED_DEFAULT_PASSWORD='<demo password>' ../.venv/bin/python manage.py seed   # idempotent; --no-demo for structure only

# Frontend (from frontend/)
npx tsc -b --noEmit     # the fast check — run it after any type or API change
npm run build
npm run dev
```

`seed` refuses to run without `SEED_DEFAULT_PASSWORD`. It seeds 5 campuses, 5
trades, 28 service items, 37 facilities, 6 facility types, 39 users and 45 demo
tickets over two weeks. Deterministic (`random.Random(20260808)`).

## Architecture

`apps/<domain>/` — common, accounts, org, sla, facilities, tickets, analytics,
notifications. Routing: `resolver/urls.py` → `api_urls.py` → `apps/<app>/urls.py`
→ views → **services** → models. Views never mutate a Ticket directly; always
through a service (`transition_status`, `claim_ticket`).

Frontend: `features/<role>/` pages, shared role-parametrised views in
`features/shared/`, self-fetching scoped data components in
`components/shared/data/`. Extend those rather than re-implementing per role.

### Scope enforcement (the critical path)

All reads go through `scoped_ticket_qs(user, role)` in
`apps/tickets/services/scope.py`. Scope derives server-side from the JWT role
claim — **never from client params** — and fails closed.

The technician branch is the dangerous one, because its scope is
two-dimensional (campus AND trade) and the two dimensions fail differently:

```python
# WRONG — cross product. A technician who is Carpentry@Nairobi and
# Plumbing@Mombasa would also match Plumbing@Nairobi and Carpentry@Mombasa.
base.filter(section__in=section_ids, sub_section__in=sub_section_ids)

# CORRECT — pairwise.
link = SectionTechnician.objects.filter(
    user=user, section_id=OuterRef("section_id"), sub_section_id=OuterRef("sub_section_id"))
return base.filter(Exists(link))
```

These agree for anyone assigned at a single campus, which is exactly why the bug
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

## Gotchas

- **Lifecycle:** `ALLOWED` in `services/lifecycle.py` is the map. Reopen clears
  `assigned_to` and restarts the SLA (`open` ⇒ unassigned — claim relies on it).
  Claim drives `open → assigned → in_progress` in one action, both hops logged.
  Frontend mirror: `StatusUpdateModal.tsx::VALID_NEXT` — keep in sync.
- **IDOR guard:** every `/tickets/{pk}/...` action view fetches via
  `get_ticket_for_request_or_403()`, never a bare `get_object_or_404`. A new
  sub-endpoint isn't done without an out-of-scope 403 test in
  `tests/test_ticket_action_scope.py`.
- **Analytics:** edit `apps/analytics/services.py::aggregate()`, not individual
  endpoints. Direct `Ticket` columns only — join fan-out here previously caused
  500s and timeouts on Neon. Breakdown-only endpoints must **not** call
  `aggregate()`; use `breakdown()` or `technician_load()`.
- **`TYPE_SPECS`** (`apps/facilities/validators.py`) is the location contract and
  is mirrored in `TicketCreationWizard.tsx::FACILITY_FORMS`. Change both in the
  same commit.
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
  endpoint changes, diff `apiClient.<verb>('…')` paths against Django's routes
  (SOT §7a). That check found a live 404 behind four roles' Feedback tab.
- Frontend role checks (`useAuth().user.role`) are UI convenience only; the
  backend enforces scope.

No feature is complete without tests and an SOT update.
