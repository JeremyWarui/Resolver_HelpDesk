# Resolver HelpDesk — Maintenance API

Backend for the Kenya School of Government maintenance helpdesk: ticket
lifecycle, trade-scoped assignment, escalation, and role-scoped analytics and
reports.

**Stack:** Django 6.0 · DRF 3.16 · PostgreSQL (local; deployment configured
entirely by env vars) · JWT · pytest

Notifications are polled over REST — there are no WebSockets, no Channels and
no web push. `../CLAUDE.md` is the architecture guide; `../REVIEW.md` is what
the system is required to do.

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
Tickets:     GET  /tickets/                POST /tickets/
             GET  /tickets/{id}/
             POST /tickets/{id}/status/    POST /tickets/{id}/assign/
             POST /tickets/{id}/claim/     POST /tickets/{id}/feedback/
             GET  /tickets/{id}/logs/
             GET+POST /tickets/{id}/comments/
             GET+POST /tickets/{id}/attachments/
             DELETE   /tickets/{id}/attachments/{id}/
             GET  /tickets/filter-options/  GET /tickets/feedback/
Users:       GET+POST /users/   PATCH+DELETE /users/{id}/
             GET+POST /users/{id}/role-assignments/   (admin)
             GET  /technicians/   /campus-roster/
Reference:   GET  /campuses/  /trades/  /service-items/  /catalog/
             GET  /priorities/  /facilities/  /facility-types/
Analytics:   GET  /analytics/            (every figure, one call)
Notifications: GET /notifications/  PATCH /notifications/{id}/read/
             POST /notifications/read-all/
Audit log:   GET  /admin/audit-log/      (admin only)
```

---

## Analytics & Reports

`apps/analytics/metrics.py` is the whole engine. Four functions, each taking a Ticket queryset already scoped to the caller plus the window being reported on:

| Function | Shape | Serves |
| --- | --- | --- |
| `totals(qs, window)` | one dict | volume, backlog, overdue, missed, escalated, response and resolution time, SLA attainment, ratings |
| `group(qs, window, dimensions)` | rows | one or two of trade, facility, campus, technician, status — `("facility", "trade")` is facility health |
| `bottlenecks(qs)` | rows | what is on hold **now**, by reason, with the oldest hold in each — a snapshot, so it takes no window |
| `trend(qs, window, bucket)` | rows | volume by day, week or month |

`GET /analytics/` returns all four in one call, and is the only reporting endpoint. Which dimensions a role may ask for is `role_config.py`, and it fails closed.

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
python manage.py process_auto_escalations           # escalation sweep (hourly)
python manage.py check_sla                          # record breaches (every 5 min)
# both take --dry-run
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

**Escalation:** Technician → HOS → HOD — structural, time-based, cron-driven.

**Priority** is a property of a ticket, not of a service. Every ticket opens at
the lowest rank and the HOS sets the real one when they assign it, so nobody
grades their own urgency.

---

## License

MIT
