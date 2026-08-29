# CLAUDE.md

> **Kenya School of Government — Maintenance Helpdesk**
> Django 6.0 · DRF 3.16 · PostgreSQL · React + TS + Vite
> `REVIEW.md` says what the system must do. This file says how it is built.
> If either disagrees with the code, the code wins and the doc is the bug.

**Response style: be terse.** Don't restate code you just wrote, don't echo file
contents back, don't end with summaries unless asked.

## What this is

A helpdesk for the Maintenance section of one department (Administration),
running at five campuses. Someone reports a broken thing; a technician fixes it.
That is the whole system.

Five trades: Carpentry, Masonry, Painting, Plumbing, Electrical. One
Maintenance section per campus, so the campus *is* the org tree — there is no
department or section table.

Six roles: **user** raises tickets, **technician** works them, **HOS** runs a
campus's technicians, **HOD** oversees the HOS, **manager** reads reports across
every campus and touches nothing, **admin** configures the system.

Not a generic service desk. Do not build for other departments or sections.

## Commands

```bash
# Backend (from backend/) — the interpreter is ../venv/Scripts/python on Windows
SECRET_KEY=dev-only-not-a-secret ../venv/Scripts/python -m pytest -q --no-cov -p no:cacheprovider
../venv/Scripts/python manage.py makemigrations && ../venv/Scripts/python manage.py migrate
SEED_DEFAULT_PASSWORD='<demo password>' ../venv/Scripts/python manage.py seed   # --no-demo for structure only

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

`seed` needs `SEED_DEFAULT_PASSWORD` or it refuses to run. It creates 5
campuses, 5 trades, 28 service items, 6 facility types, 56 facilities, 41 users
and 168 demo tickets over 90 days, with their history, comments, notifications
and a few attachments. It is deterministic and safe to re-run.

Every account is `first.last@ksg.ac.ke`, so the address does not say who is
what. The command prints one login per role when it finishes.

## Structure

```
backend/apps/
├── accounts/      CustomUser, RoleAssignment, TechnicianTrade — who someone is
├── org/           Campus, Trade, ServiceItem — structure, names no user
├── facilities/    FacilityType, Facility — where a job is
├── sla/           Priority — targets and escalation thresholds
├── tickets/       Ticket, TicketLog, TicketComment, TicketAttachment
├── notifications/ Notification and the emitters that write it
├── analytics/     the metrics engine and the one reporting endpoint
└── common/        roles, pagination, admin, the seed command
```

A request goes `resolver/urls.py` → `api_urls.py` → `apps/<app>/urls.py` →
view → service module → model.

There is no `services/` subpackage. A service module sits directly in its app:
`tickets/{scope,lifecycle,escalation,sla,attachments,phone,constants}.py`,
`accounts/{identity,scope,posts}.py`, `analytics/{metrics,role_config}.py`.

**A view never writes a ticket's state.** It calls `transition_status`,
`assign_ticket` or `claim_ticket` in `tickets/lifecycle.py`.

Frontend: `features/<role>/` for pages, `features/shared/` for views that take
the role as a parameter, `components/shared/data/` for components that fetch
their own scoped data. Extend those rather than writing a copy per role.

### Writing comments

Present tense, and about the code as it stands — never about a change or what
came before. A module docstring says what the file is responsible for, a
function docstring what it does, a `#` comment why. Two lines is plenty;
`Meta` and `__str__` need none.

## The data

**Ticket** holds current state only: who raised it, the campus and trade, the
service item, the facility and its location values, the priority, assignee,
status, SLA clock and rating. What *happened* to it is a **TicketLog** row,
append-only.

Routing is derived, never chosen: the requester picks a service item and a
place, the trade comes from the item and the campus from the requester. Two
people reporting the same fault land in the same queue.

A technician's scope is a set of **(campus, trade)** pairs, one
`TechnicianTrade` row each. A role is one **RoleAssignment** row per user.

## Roles and what each can do

| Role | Sees | Can do |
|---|---|---|
| user | own tickets | raise, read the trail, rate, close, reopen |
| technician | own (campus, trade) pairs | claim, work, comment on tickets assigned to them |
| HOS | own campus | assign, set priority, move any ticket, comment |
| HOD | own campus | the same as HOS |
| manager | every campus | read reports. Nothing else. |
| admin | everything | configure, manage users and roles, read the audit log |

**Comments are the staff working log, not a conversation with the requester.**
The requester can neither read nor post them. No comments before a technician is
assigned or after the ticket is closed. Among technicians, only the assignee may
post. The manager may not post.

**The requester reads the activity trail instead**, and their copy leaves out
comment events — a row they cannot open is a dead end.

## Ticket lifecycle

```
open → assigned → in_progress → resolved → closed
                       ⇅            │         │
                    pending ────────┘         │
                                    └── reopen to open ──┘
```

`pending` goes back to `in_progress` or straight to `resolved`. Both `resolved`
and `closed` can reopen.

`ALLOWED` in `tickets/lifecycle.py` is the map. The frontend mirrors it in
`VALID_NEXT_STATUS` (`src/constants/tickets.ts`), read by `StatusUpdateModal.tsx`
and `MobileTicketDetail.tsx`. Keep the two in step.

`open` means unassigned, which claim relies on — so reopening clears the
assignee and restarts the clock. Claim takes a ticket from open to in_progress
in one action, logging both hops. `pending` needs a reason from a fixed list of
six, never free text, or it cannot be reported on. A settled ticket cannot be
assigned; reopen it first.

## SLA and escalation

Each priority carries four durations: a response target, a resolution target,
and two escalation thresholds. A ticket opens at the lowest priority and the HOS
sets the real one when they assign it, so nobody grades their own urgency.

The clock starts when the ticket is raised. A hold freezes it, and both targets
move out by however long the hold lasted.

**Overdue and missed are different words.** Overdue means live now and past
target. Missed means settled, and it finished late. A settled ticket is judged
against when it was resolved, never against the current time — otherwise every
ticket ever closed turns red eventually. Both come from `tickets/sla.py`, which
is the only place either is defined.

Escalation is structural: technician → HOS → HOD, on the priority's two
thresholds, run by `process_auto_escalations`. A vacant post is skipped and the
ticket keeps climbing.

## Scope: the critical path

Every read starts from `scoped_ticket_qs(user, role)` in `apps/tickets/scope.py`.
Scope comes from the role claim on the JWT — **never from a client parameter** —
and an unknown role sees nothing.

The technician branch is the one that is easy to get wrong, because its scope
has two dimensions:

```python
# WRONG — cross product. Someone who is Carpentry@Nairobi and Plumbing@Mombasa
# would also match Plumbing@Nairobi and Carpentry@Mombasa.
base.filter(requester_campus__in=campus_ids, trade__in=trade_ids)

# CORRECT — pairwise. The (campus, trade) pair must exist as a row.
link = TechnicianTrade.objects.filter(
    user=user, campus_id=OuterRef("requester_campus_id"), trade_id=OuterRef("trade_id"))
return base.filter(Exists(link))
```

The two agree for anyone working a single campus, which is why the bug survives
casual testing. `test_multi_campus_technician_sees_only_assigned_pairs` is what
catches it.

Filters narrow, never widen. `?trade=` applies *after* scoping, so an
out-of-scope id matches nothing rather than reaching past the caller.

Every `/tickets/{id}/...` view fetches through `get_ticket_for_request_or_403()`,
never a bare `get_object_or_404`. A new sub-endpoint is not done until it has an
out-of-scope 403 test in `tests/test_ticket_action_scope.py`.

## What the API gives the frontend

**Two ticket shapes.** The list row carries what a table cell renders: number,
who and where, service item, trade, priority, assignee, facility name, status,
level, resolution target, hold label, late flag, rated flag, timestamps. The
detail shape adds the contact phone, the full location, the SLA internals, the
hold reason and note, and the feedback. Never read a detail-only field off a
list row.

**One list envelope.** Paged lists return DRF's `{count, next, previous,
results}`. Comments, logs and the audit trail are cursor-paged and return the
same keys, with `count` null. Short fixed lists (trades, technicians,
attachments) return a bare array. Notifications return `{results, unread_count}`.

**Everything is snake_case.**

Reference data the wizard needs: `/catalog/` (active trades and their active
items), `/facilities/?campus=`, `/facility-types/`, `/priorities/`.

A dead endpoint still compiles. After any batch of endpoint changes, diff every
`apiClient.<verb>('…')` path against Django's routes, comparing trailing slashes
exactly — `APPEND_SLASH` turns a slashless POST into a 405.

A green `tsc` says nothing about what renders. A mislabelled column, a dead card,
an empty chart, a search box filtering on a property its rows lack — `tsc` is
green for all of them. Run the Playwright suite after UI changes;
`e2e/ticket-lifecycle.spec.ts` is the template.

## Rules that must hold

1. `RoleAssignment` is one row per user. No second role, no validity window, no
   switching.
2. Ticket holds current state; `TicketLog` holds history and is append-only.
3. A paused ticket's clock is frozen. It is never overdue and never at risk.
4. Escalation is technician → HOS → HOD. It is not configurable workflow.
5. Everyone can raise a ticket. Routing comes from the service item and the
   requester's campus, never from their role.
6. Priority belongs to a ticket, not to a service.
7. Every ticket has a location.
8. The email address is the identity. Login takes `{email, password}`; username
   and name are derived from it in `apps/accounts/identity.py` and never taken
   from the client. Changing the email renames the account.
9. `apps/accounts/posts.py::assign_role` is the only writer of a role. It writes
   the `RoleAssignment` row and the `TechnicianTrade` links together, and demotes
   whoever held a single-holder post. Writing one side alone gives someone the
   title, the dashboard and the JWT claim, and an empty ticket list.

## Easy to get wrong

- **Analytics lives in one file.** `apps/analytics/metrics.py` — `totals`,
  `group`, `bottlenecks`, `trend`, each taking a scoped queryset and a window.
  `_figure_set()` defines every figure once. Edit there, never in a view, and
  use direct `Ticket` columns only: a join fans the rows out.
- **Every grouped query needs its own `order_by()`.** An inherited ordering
  field joins the GROUP BY and splits each bucket into one row per ticket.
  `test_a_bucket_is_one_row_however_the_tickets_in_it_differ` guards it.
- **`bottlenecks()` is a snapshot and takes no window.** `pending_reason` clears
  when work resumes, so holds can only be read as of now. There is no hold
  history and nothing answers "what was on hold in March". That is a decision —
  do not add a history column without making it again.
- **Group by trade, never by section.** Maintenance is the only section, so a
  section breakdown restates the campus chart beside it. `role_config.py`
  refuses it; charts, tables and filter dropdowns must follow.
- **`TYPE_SPECS`** (`apps/facilities/validators.py`) is the location contract.
  The frontend mirrors it in one place: `src/constants/catalogue.ts`, which
  holds both the codes and `FACILITY_FORMS`. Change the two together.
- **A new query param means a filter and a negative test**, same commit. A param
  nothing reads looks like scoping and does nothing.
- **Ticket numbers** are built from the pk in `Ticket.save()`
  (`TKT-<CAMPUS>-<pk padded to 5>`), so the first save is two writes. No
  sequence table. Never parse one to make the next; gaps are fine.
- **Phone numbers** are Kenyan, stored E.164, defined once in
  `apps/tickets/phone.py`.
- **Notifications are polled, not pushed.** The emitters in
  `apps/notifications/notify.py` are wrapped so a failed notification can never
  break the ticket update that triggered it.
- **Retiring is the only delete.** `Ticket.service_item` is `PROTECT`, so a
  trade or item that has ever been used cannot be removed — `is_active` takes it
  out of the catalogue instead.

No feature is done without tests.
