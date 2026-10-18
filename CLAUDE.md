# CLAUDE.md

> **Kenya School of Government — Maintenance Helpdesk**
> Django 6.0 · DRF 3.16 · PostgreSQL · React + TS + Vite
> This file says what the system does and how it is built.
> If it disagrees with the code, the code wins and the doc is the bug.

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
campus's technicians, **HOD** oversees the HOS, **manager** reads the figures
for every campus and opens no ticket, **admin** configures the system.

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
E2E_PASSWORD='<seed password>' npm run test:e2e   # Playwright; starts the servers
node scripts/check-nav.mjs     # every nav item has a section, and back
node scripts/render-icons.cjs  # PNG app icons from public/pwa-512.svg
```

The e2e suite runs on its own servers and its own database, never the
developer's. `e2e/backend.mjs` migrates and seeds a fresh SQLite file in the OS
temp folder and serves it on 8001; `vite dev` runs on 5174 and a production
build under `vite preview` on 4174 (for `installable.spec.ts`). None of them is
reused, so the dev servers on 8000 and 5173 can stay up. `DATABASE_URL` in the
environment overrides `backend/.env`, which is how the file takes over. A spec
calling the API directly uses `http://localhost:8001`.

Tests run on in-memory SQLite (`resolver/test_settings.py`), so the suite never
touches a real database. The app runs on local PostgreSQL; copy
`backend/.env.example` to `backend/.env`.

`seed` needs `SEED_DEFAULT_PASSWORD` or it refuses to run. It creates 5
campuses, 5 trades, 28 service items, 6 facility types, 56 facilities, 41 users
and about 440 demo tickets over 90 days, with their history, comments, notifications,
a few attachments and some system feedback. It is deterministic and safe to
re-run; `manage.py flush` first to start again from nothing.

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
├── system_feedback/ SystemFeedback — what people say about the system itself
├── analytics/     the metrics engine and the one reporting endpoint
└── common/        roles, pagination, admin, the seed command
```

A request goes `resolver/urls.py` → `api_urls.py` → `apps/<app>/urls.py` →
view → service module → model.

There is no `services/` subpackage. A service module sits directly in its app:
`tickets/{scope,lifecycle,escalation,sla,attachments,phone,constants}.py`,
`accounts/{identity,scope,posts}.py`, `analytics/{metrics,role_config}.py`.

**A view never writes a ticket's state.** It calls `transition_status`,
`assign_ticket`, `claim_ticket` or `rate_ticket` in `tickets/lifecycle.py`.

### The frontend

```
frontend/src/
├── app/           routing shells: auth screens, the dashboard shell, ticket detail
├── features/      pages, by role — admin, manager, technician, user, shared
├── components/
│   ├── ui/        shadcn primitives. Generated; `cn` lives at `@/lib/utils`
│   │              because `components.json` points there.
│   └── shared/    the app's own components: data/, ticket/, forms/, feedback/
├── hooks/         flat, except hooks/tickets/ where four belong together
├── lib/api/       one module per backend app; named exports, bar the
│                  axios instance itself
├── constants/     one file per subject, eight of them
├── types/         reached only as `@/types`
├── stores/        zustand: the session, and sidebar state
└── utils/         dates, phone, bytes, DRF errors, identity, validation
```

`features/shared/` holds anything more than one role renders — including
`SupervisorLayout`, which **both** the HOS and the HOD use, because
`ROLE_NAV.hos` and `ROLE_NAV.hod` list the same sections and the difference
between them is scope, which the server decides. There is no `features/hos/`
or `features/hod/`.

**One way in per layer.** Import the module, not a folder — `hooks/` and
`lib/api/` have no barrels, and the half-adopted ones they used to have meant
seventeen imports reaching past them. `@/types` is the deliberate exception: one
door for every domain type, and no file imports `types/ticket.types` directly.
`lib/api` exports named functions; there is no service object wrapping the same
calls a second time.

**Identity in Zustand, verification in React Query.** `useAuthStore` hydrates
from localStorage synchronously at module load, so whether there is a session
is known on the first render — which is why no route guard has a loading state,
and why the axios interceptor can read the token before React has mounted. It
is also the only session state reachable from non-React code and the only one
that syncs across tabs. React Query owns the part the server can change under
you: `useUserData` re-validates the cached role against `/auth/me/`.
`useAuth` holds nothing but the three mutations.

**Say a thing once.** Before adding a map, a badge or a dialog footer, check
whether it exists:

| For | Use |
|---|---|
| A status, priority or escalation badge | `TokenPill` |
| A dialog's Cancel/Save row | `DialogActions` |
| A row of figures | `MetricCard`, `MetricCardRow` |
| A ticket list | `TicketTable` + a variant in `TicketTableColumns` |
| A register with a filter rail | `RailLayout` |
| Role names, scope, escalation levels | `constants/roles.ts` |
| Notification labels and tints | `constants/notifications.ts` |

Escalation level in particular had four spellings across four files before it
had one. A second copy of a vocabulary is how they drift.

### Writing comments

Present tense, and about the code as it stands — never about a change or what
came before. A module docstring says what the file is responsible for, a
function docstring what it does, a `#` comment why. Two lines is plenty;
`Meta` and `__str__` need none.

## The data

**Ticket** holds current state only: who raised it, the campus and trade, the
service item, the facility and where in it (`location_detail`, one line of
free text), the priority, assignee, status, SLA clock and rating. What *happened* to it is a **TicketLog** row,
append-only.

Routing is derived, never chosen: the requester picks a service item and a
place, the trade comes from the item and the campus from the requester. Two
people reporting the same fault land in the same queue.

A technician's scope is a set of **(campus, trade)** pairs, one
`TechnicianTrade` row each. A role is one **RoleAssignment** row per user.

## Roles and what each can do

| Role | Sees | Can do |
|---|---|---|
| user | own tickets | raise, read the trail, read comments while pending or resolved, rate, close, reopen |
| technician | own (campus, trade) pairs; reports and ratings on jobs assigned to them | claim, work, comment on tickets assigned to them |
| HOS | own campus, every trade, its facilities | assign, set priority, move any ticket, comment, read ratings |
| HOD | own campus, every trade, its facilities | the same as HOS; the last escalation level |
| manager | every campus: ticket table, reports, technicians, facilities, campuses, ratings | read only; opens no ticket |
| admin | everything | configure, manage users and roles |

Every role can also raise tickets and read its own under My Requests, and
has a Notifications page. Everyone but the admin can send system feedback
from the sidebar; the admin reads it under System Feedback.

**Comments are the staff working log.** Staff in scope read them. Posting opens
once a technician is assigned and closes with the ticket; among technicians
only the assignee may post. The requester never posts, and reads the thread
only while the ticket is `pending` or `resolved` (`REQUESTER_COMMENT_STATUSES`,
mirrored in `src/constants/tickets.ts`); they are notified of a comment posted
at those statuses. Their activity trail leaves out comment events.

**Three ticket scopes in `tickets/scope.py`.** `scoped_ticket_qs` is what a
role may open and act on; `listed_ticket_qs` what its ticket table and filter
dropdowns list; `reporting_ticket_qs` what its figures (`/analytics/`) and
ratings (`/tickets/feedback/`) cover. They differ for two roles. The manager
opens nothing but lists and reports on every campus. A technician lists their
(campus, trade) pairs but reports only on jobs assigned to them.

Facilities follow the campus: the admin and manager read every campus's
register, everyone else their home campus plus any campus their post or
trades cover. Campuses and the campus roster are read by the admin and the
manager only.

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
`VALID_NEXT_STATUS` (`src/constants/tickets.ts`), read by `StatusUpdateModal.tsx`.
Keep the two in step.

`open` means unassigned, which claim relies on — so reopening clears the
assignee, drops the escalation level back to technician and restarts the clock. Claim takes a ticket from open to in_progress
in one action, logging both hops. `pending` needs a reason from a fixed list of
six, never free text, or it cannot be reported on. A settled ticket cannot be
assigned; reopen it first.

Rating is the requester's sign-off: `rate_ticket` records the rating and, if
the ticket is resolved, closes it in the same transaction, so no ticket is
ever rated and still resolved. A ticket closed without a rating may still be
rated. Reopening clears the rating; the old one stays on the trail.

Demo tickets from `seed` are raised by someone based at the ticket's campus,
and only closed ones carry a rating. Arrivals are densest now and thin out
smoothly over 90 days; a ticket's status follows from its age
(`STATUS_BY_AGE`), so new work is live and nothing past two weeks is still
open. Some finish late, so the SLA figures are not all 100%. Descriptions,
handover notes and rating comments are written the way people write them.
Escalation runs until nothing moves and is dated when each ticket crossed its
threshold, so some tickets reach the HOD. `tests/test_seed.py` holds each of
these, seeding once per module.

## SLA and escalation

Each priority carries four durations: a response target, a resolution target,
and two escalation thresholds. A ticket opens at the lowest priority and the HOS
sets the real one when they assign it, so nobody grades their own urgency.

The clock starts when the ticket is raised and again when it is reopened;
`clock_started_at` records which. A hold freezes it, and both targets move out
by however long the hold lasted. Escalation and a priority change both measure
from `clock_started_at`, never `created_at`, or a reopened ticket would
escalate at once and get deadlines already in the past.

**Overdue and missed are different words.** Overdue means live now and past
target. Missed means settled, and it finished late. A settled ticket is judged
against when it was resolved, never against the current time — otherwise every
ticket ever closed turns red eventually. Both come from `tickets/sla.py`, which
is the only place either is defined.

Escalation is structural: technician → HOS → HOD, on the priority's two
thresholds, run by `process_auto_escalations --scheduled` every
`ESCALATION_INTERVAL_MINUTES` (15). On the Windows server,
`scripts/windows/register-escalation-task.ps1` registers that task once. A vacant
post is skipped and the ticket keeps climbing. There is no separate SLA-breach
job: overdue is computed live, and escalation is the alert.

Each pass is an `EscalationRun`, and the SLA Rules page reads the scheduled ones
to say whether the schedule is alive (`schedule_state`: never, stale, failing,
running). Only a run started with `--scheduled` counts; Run now and a run typed
at the command line are recorded but prove nothing about the task. Each ticket
moves in its own transaction under a row lock, pinned to the level it was read
at, so overlapping runs never move a ticket twice.

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
level, resolution target, hold label and when the hold began, late flag, rated flag, timestamps. The
detail shape adds the contact phone, the full location, the SLA internals, the
hold reason and note, and the feedback. Never read a detail-only field off a
list row.

**One list envelope.** Paged lists return DRF's `{count, next, previous,
results}`. Comments and logs are cursor-paged and return the
same keys, with `count` null. Short fixed lists (trades, technicians,
attachments) return a bare array. Notifications return `{results, unread_count,
has_more}`, 50 at a time unless `?limit=` (at most 100) says otherwise, paged
with `?before=<id>`. The Notifications page asks for 20 and offers Load more.

**Everything is snake_case.**

Ratings read over a period, by when they were given: `/tickets/feedback/`
pages them 20 at a time (`days`, or `date_from` and `date_to`, as on
`/analytics/`; `?rating=1..5` narrows to one star), and
`/tickets/feedback/summary/` gives the period's count, average, comments and
stars over every rating in it, from `metrics.ratings`. The Feedback page never
computes a figure from the rows it has loaded.

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
- **The report downloads read the same figures.** `apps/analytics/export.py`
  builds the Excel workbook (openpyxl) and the PDF summary (ReportLab) from
  `report_data`, which calls `metrics` over `reporting_ticket_qs`. Never
  compute a figure there. Every role with reports gets both files: the admin,
  manager, HOD and HOS their Reports page, the technician their own work
  (`summary_rows`) (`XLSX_ROLES`, `PDF_ROLES`,
  mirrored by `REPORT_DOWNLOADS` in `src/constants/analytics.ts`).
  `test_the_workbook_says_what_the_reports_page_says` holds the two together.
  Times in both are Kenyan time.
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
- **Facility types** are `FACILITY_TYPES` in `apps/facilities/models.py`. The
  frontend mirrors the codes once, in `src/constants/catalogue.ts` with their
  wizard tiles (`FACILITY_TILES`). Change the two together.
- **One layout for every screen size.** There is no separate mobile app. Below
  `sm` the sidebar becomes the `MobileNav` drawer, and `e2e/phone.spec.ts`
  fails any section wider than a 390px screen. The phone is for the people
  out and about: the drawer leaves out sections marked `desktopOnly` in
  `roleNav.ts` (a requester's My Tickets table, a technician's Section
  Tickets), and the requester's dashboard pages through every active request
  instead. The desk roles (`DESK_ROLES`: admin, manager, HOD, HOS) keep every
  section on a phone, under a dismissible note that the pages are laid out for
  a computer; their tables are not reworked for a phone. The app installs from the
  browser (`vite-plugin-pwa`, `src/sw.ts`); the service worker caches the app
  shell only, never an API response.
- **A new query param means a filter and a negative test**, same commit. A param
  nothing reads looks like scoping and does nothing.
- **An SLA percentage means `met / (met + missed)`** — settled work only. That
  is what `resolution_sla_pct` computes in `metrics.py`, and no page computes
  its own. Overdue work is live and has no outcome yet, so it has its own card
  and does not belong in this denominator.
- **Never gate rendering on a React Query result's identity.** `useQuery` hands
  back the same array reference on every render once it is cached, so
  `if (prev !== data)` fires on the first load and then never again. The ticket
  wizard resolved its pre-filled trade that way: the first service card worked
  and every one after it opened an empty list. Gate on the state you actually
  need — `if (!trade && …)` — not on whether the cache object changed.
- **Ticket numbers** are built from the pk in `Ticket.save()`
  (`TKT-<CAMPUS>-<pk padded to 5>`), so the first save is two writes. No
  sequence table. Never parse one to make the next; gaps are fine.
- **Phone numbers** are Kenyan, stored E.164, defined once in
  `apps/tickets/phone.py`.
- **Notifications are polled, not pushed.** The emitters in
  `apps/notifications/notify.py` are wrapped so a failed notification can never
  break the ticket update that triggered it. The feed filters with `?unread=1`
  and `?event_type=a,b`, and `unread_count` ignores both, so the sidebar badge
  never stops at a filter. The sidebar's Notifications item is the only way in;
  on a phone the menu button carries a dot while anything is unread.
- **A notification is a message.** One action sends one message to each
  recipient, never to the person who acted. A typed note travels with it as
  `Notification.note`, to the people it was written for: the HOS's handover to
  the technician; a progress note to the requester; a hold's reason and note,
  and a resolution note, to the requester and the HOS. The activity trail shows
  one line per event and never the notes. The feed is newest first by
  `created_at`, with the id breaking ties, so a back-dated row lands in place.
- **System feedback is not a rating.** `apps/system_feedback/` holds what people
  say about Resolver itself; a rating of a fix stays on its ticket. The sender
  and their role come from the request, never the body, and sending is
  throttled (`DEFAULT_THROTTLE_RATES`).
- **Retiring is the only delete.** `Ticket.service_item` is `PROTECT`, so a
  trade or item that has ever been used cannot be removed — `is_active` takes it
  out of the catalogue instead.
- **Accounts are deactivated, never deleted** (`/users/{id}/deactivate/` and
  `/reactivate/`; DELETE is a 405). A deactivated person cannot sign in or
  refresh, cannot be assigned, leaves their post vacant so escalation skips
  them, and drops out of notifications, the staffing figures and every
  technician list. Every query that finds a person to act on filters
  `is_active=True`; a new one must too. `posts.assign_role` refuses to give a
  deactivated account a post someone else holds.
- **One Reports page, two kinds of dashboard.** The admin, manager, HOD and HOS
  share one Reports page (`/analytics/overview/`, `OVERVIEW_ROLES`); the HOD and
  HOS see their campus and a technician table where the admin and manager see
  campuses (`EVERY_CAMPUS_ROLES`, mirrored in `src/constants/roles.ts`). The
  manager, HOD and HOS share one dashboard (`/analytics/dashboard/`,
  `DASHBOARD_ROLES`). The admin's dashboard is `/analytics/desk/`:
  escalation health, cover gaps, accounts to fix (`accounts/health.py`), email
  set up or not, and a row per campus. Cover by trade on the Technicians page
  is `/analytics/cover/`.

No feature is done without tests.
