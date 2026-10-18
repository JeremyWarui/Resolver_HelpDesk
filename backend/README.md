# Resolver HelpDesk — Maintenance API

Backend for the Kenya School of Government maintenance helpdesk: ticket
lifecycle, trade-scoped assignment, escalation, and role-scoped analytics and
reports.

**Stack:** Django 6.0 · DRF 3.16 · PostgreSQL (local; deployment configured
entirely by env vars) · JWT · pytest

Notifications are polled over REST — there are no WebSockets, no Channels and
no web push. `../CLAUDE.md` is the architecture guide.

---

## Quick Start

```bash
git clone https://github.com/JeremyWarui/django_resolver && cd django_resolver
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/django_resolver
SECRET_KEY=your-secret-key
DEBUG=True
```

```bash
python manage.py migrate
SEED_DEFAULT_PASSWORD='<demo password>' python manage.py seed
python manage.py runserver          # http://localhost:8000
```

**Admin panel:** http://localhost:8000/admin

---

## Seed Accounts

`seed` creates 41 demo users across every role, all sharing the password given
in `SEED_DEFAULT_PASSWORD` (required — the command aborts if it is unset, and
the password is never committed). `--no-demo` seeds structure and accounts
without the demo tickets.

Every account is `first.last@ksg.ac.ke`, because the email **is** the identity
and the username derives from it. The address therefore does not say who is
what, so the command ends by printing one login per role.

---

## Architecture

### App layout

```
apps/
├── accounts/     — CustomUser, RoleAssignment, TechnicianTrade, JWT auth
├── org/          — Campus, Trade, ServiceItem  (structure only, names no user)
├── tickets/      — Ticket, TicketLog, TicketComment, TicketAttachment
├── sla/          — Priority  (targets and the two escalation thresholds)
├── facilities/   — Facility, FacilityType
├── analytics/    — metrics engine and the one reporting endpoint
├── notifications/— Notification, and the emitters that write it
├── system_feedback/ — SystemFeedback: what people say about the system
└── common/       — roles, pagination, admin, the seed command
```

### Request flow

```
HTTP → resolver/urls.py → resolver/api_urls.py → apps/*/urls.py → views → service module → models
```

No app has a `services/` subpackage; a service module sits directly in its app
(`tickets/lifecycle.py`, `tickets/scope.py`, `accounts/posts.py`). Views never
mutate a Ticket directly — always through `transition_status`, `assign_ticket`
or `claim_ticket`.

### Scope enforcement

Every read derives scope from the JWT role claim via `scoped_ticket_qs(user, role)` in `apps/tickets/scope.py`. Scope is never read from client query params — it is resolved server-side and fails closed (empty queryset on an unknown role).

---

## Roles

| Role | Scope |
|------|-------|
| Admin | Organisation-wide |
| Manager | Every campus, read-only |
| HOD | Own campus |
| HOS | Own campus |
| Technician | The (campus, trade) pairs held as `TechnicianTrade` rows |
| Requester | Own tickets only (every authenticated user) |

---

## Key Endpoints

All under `/api/v1/`:

```
Auth:        POST /auth/login/  /auth/register/  /auth/refresh/  /auth/logout/
             GET  /auth/me/     /auth/campuses/   (campuses is public)
             POST /auth/password-reset/  /auth/password-reset/confirm/   (emailed link)
Tickets:     GET  /tickets/                POST /tickets/
             GET  /tickets/{id}/
             POST /tickets/{id}/status/    POST /tickets/{id}/assign/
             POST /tickets/{id}/claim/     POST /tickets/{id}/feedback/
             GET  /tickets/{id}/logs/
             GET+POST /tickets/{id}/comments/
             GET+POST /tickets/{id}/attachments/
             DELETE   /tickets/{id}/attachments/{id}/
             GET  /tickets/filter-options/  GET /tickets/feedback/
Users:       GET+POST /users/   PATCH /users/{id}/   (admin; no DELETE)
             POST /users/{id}/deactivate/  /users/{id}/reactivate/   (admin)
             GET+POST /users/{id}/role-assignments/   (admin)
             GET  /technicians/   /campus-roster/
Reference:   GET  /campuses/  /trades/  /service-items/  /catalog/
             GET  /priorities/  /facilities/  /facility-types/
Analytics:   GET  /analytics/            (figures for one role's scope; the technician's reports)
             GET  /analytics/overview/   (the Reports page; admin, manager, HOD, HOS)
             GET  /analytics/dashboard/  (manager, HOD, HOS)
             GET  /analytics/desk/       (the admin's dashboard)
             GET  /analytics/cover/      (technicians per campus and trade)
             GET  /analytics/export/xlsx/  /analytics/export/pdf/   (every role with reports)
Escalation:  GET  /escalations/  /escalations/preview/   POST /escalations/run/   (admin)
Notifications: GET /notifications/  (?limit=1..100 ?unread=1 ?event_type=a,b ?before=<id>)
             PATCH /notifications/{id}/read/   POST /notifications/read-all/
Feedback:    POST /system-feedback/  (anyone signed in, 10 an hour)
             GET  /system-feedback/  (?status=new|reviewed)   PATCH /system-feedback/{id}/  (admin)
             An unknown ?status, ?event_type, or a non-numeric ?limit/?before is a 400.
```

The manager is refused every ticket endpoint bar their own raised tickets, and
reads the reports over every campus.

---

## Analytics & Reports

`apps/analytics/metrics.py` is the whole engine. Four functions, each taking a Ticket queryset already scoped to the caller plus the window being reported on:

| Function | Shape | Serves |
| --- | --- | --- |
| `totals(qs, window)` | one dict | volume, backlog, overdue, missed, escalated, response and resolution time, SLA attainment, ratings |
| `group(qs, window, dimensions)` | rows | one or two of trade, facility, campus, technician, status — `("facility", "trade")` is facility health |
| `bottlenecks(qs)` | rows | what is on hold **now**, by reason, with the oldest hold in each — a snapshot, so it takes no window |
| `trend(qs, window, bucket)` | rows | volume by day, week or month |

Every reporting endpoint calls these four; none computes a figure of its own. `overview.py` arranges them into the Reports page, `dashboard.py` into the dashboard, and `export.py` into the Excel and PDF downloads. Which dimensions a role may group `/analytics/` by is `role_config.py`, and it fails closed.

Because `bottlenecks` is a snapshot, **a hold is reportable only while it lasts**. Nothing keeps hold history, so there is no answer to "what was on hold in March". That is a decision, not a gap: each pause stays on its ticket's own trail as a `status_changed` row, and only the aggregate is dropped.

---

## Testing

```bash
SECRET_KEY=dev-only-not-a-secret pytest -q --no-cov     # the whole suite
SECRET_KEY=dev-only-not-a-secret pytest tests/test_scope.py -q
```

Tests live in `backend/tests/` and run on in-memory SQLite
(`resolver/test_settings.py`), so the suite never touches a real database.

---

## Management Commands

```bash
SEED_DEFAULT_PASSWORD='<pw>' python manage.py seed  # idempotent; --no-demo for structure only
python manage.py process_auto_escalations --scheduled  # escalation check, every 15 minutes; --dry-run to preview
```

---

## Org Hierarchy

```
Campus  ── the whole tree; one Maintenance section per campus is implied
  ├── TechnicianTrade  (user + campus + trade)  ← the scoping pair
  └── Ticket  (requester_campus + trade)

Trade  ── global, five of them; ServiceItem hangs off it
```

**Ticket numbering:** `TKT-CAMPUS-NNNNN` (e.g. `TKT-NRB-00001`), built from
the pk in `Ticket.save()`. There is no sequence table.

**Status workflow:** `open → assigned → in_progress ⇄ pending → resolved → closed`

**Escalation:** Technician → HOS → HOD — structural and time-based, checked
every `ESCALATION_INTERVAL_MINUTES` (15) by a scheduled task.
`scripts/windows/register-escalation-task.ps1` registers it on Windows.

**Priority** is a property of a ticket, not of a service. Every ticket opens at
the lowest rank and the HOS sets the real one when they assign it, so nobody
grades their own urgency.

---

## License

MIT
