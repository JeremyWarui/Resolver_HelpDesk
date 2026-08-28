# Resolver HelpDesk

A **Maintenance Helpdesk** for the Kenya School of Government's Administration
Department, operating across multiple campuses.

This is *not* a generic enterprise Service Desk. It is a focused, lean system for
raising, assigning, tracking and rating maintenance work (Electrical, Plumbing,
Carpentry, Masonry, Painting) — built by reusing the proven parts of an earlier
multi-department Service Desk implementation and removing the business
complexity that the current need does not justify.

## Repository layout

```
Resolver_HelpDesk/
├── backend/     Django 6.0 + DRF 3.16 + PostgreSQL
├── frontend/    React + TypeScript + Vite
├── docs/        Briefing and the reports styling guide
├── CLAUDE.md    How the system is built
├── REVIEW.md    What the system must do
├── README.md
└── CHANGELOG.md
```

## Provenance

`backend/` and `frontend/` are copies of the reference implementation:

| New path    | Copied from                                       |
| ----------- | ------------------------------------------------- |
| `backend/`  | `/home/jeremy/Desktop/portfolio/django_resolver`  |
| `frontend/` | `/home/jeremy/Desktop/portfolio/Resolver/client`  |

Both source projects **remain untouched** and stay the reference for the broader
enterprise Service Desk platform. Build artefacts and dependency trees
(`.venv/`, `node_modules/`, `dist/`, `staticfiles/`, caches) and the original
`.git` histories were not copied — this repository has its own history.

## Status

**Backend reviewed and trimmed against `REVIEW.md`; frontend not yet.** The
backend suite is green (186 test functions) and the seed runs end to end. The
frontend still calls the pre-trim contract in several places and is the next
piece of work.

`REVIEW.md` is what the system is required to do. `CLAUDE.md` is the working
guide and the architecture reference — start there.

What this is, in one paragraph: one department (Administration), one section
type (Maintenance), five trades, five campuses. Roles are one per user, with no
cover and no switching. Technician scope is two-dimensional — campus **and**
trade — and enforced pairwise. Every ticket carries a location chosen from six
facility types, and a priority the HOS sets at assignment. Escalation is
structural: technician → HOS → HOD. Notifications are polled; there are no
WebSockets, no web push and no per-campus workflow configuration.

## Getting started

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in DB + secret values
python manage.py migrate
SEED_DEFAULT_PASSWORD='<demo password>' python manage.py seed
python manage.py runserver
pytest -q --no-cov
```

`seed` is idempotent and refuses to run without `SEED_DEFAULT_PASSWORD`. It
creates 5 campuses, 5 trades, 28 service items, 56 facilities, 41 users and 168
demo tickets spread over the previous 90 days.

Sign-in is by email address, and a seeded person's address is their name —
`peter.kimani@ksg.ac.ke` is the Nairobi HOS. The address does not say what
anyone is, so the command prints one login per role when it finishes.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
npx tsc -b --noEmit           # the fast check

# Playwright. Both servers start automatically; needs a seeded database.
E2E_PASSWORD=<seed password> npm run test:e2e
```

The e2e suite covers admin navigation, catalogue and user CRUD, and the whole
ticket lifecycle — a requester raising a ticket through the wizard, the
technician it routes to claiming and resolving it, and a technician on the same
campus but a different trade being unable to see it. It creates and deletes its
own catalogue and user rows; tickets are append-only, so the ones it raises stay
put and are labelled `E2E`.

## Scope

**In scope** — maintenance operations under Administration: ticket lifecycle,
technician trades and assignment, escalation, feedback and ratings, campus and
organisation-wide reporting.

**Out of scope** — ICT, HR, Procurement, Finance and other departmental service
desks.

**Future** — Security, Transport, Telephone Exchange, Staff Housing, Cleaning
Services. The architecture should absorb these without redesign.
