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
├── docs/
│   ├── architecture/   Architecture assessment, proposed lean architecture
│   ├── migration/      Gap analysis, migration roadmap
│   ├── refactoring/    Refactoring matrix, per-module decisions
│   └── future/         Planned Administration modules
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

**Built.** Backend and frontend are ported and reconciled against each other:
221 backend tests pass, the frontend typechecks and builds, and every
`apiClient` path the frontend calls resolves to a Django route.

`docs/architecture/target-architecture.md` is the as-built architecture and the
place to start. `CLAUDE.md` is the working guide.

What changed from the reference implementation, in one paragraph: the catalogue
lost a level (`ServiceCategory` folded into `SubSection`, which is also the
technician scoping boundary) and lost priority entirely; roles collapsed to one
per user with no cover and no switching; technician scope became two-dimensional
(campus **and** trade), enforced pairwise; every ticket now carries a location,
chosen from six facility types; WebSockets, web push and per-campus workflow
configuration are gone.

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
creates 5 campuses, 5 trades, 28 service items, 37 facilities, 39 users and 45
demo tickets spread over the previous fortnight.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
npm run test:e2e              # Playwright
```

## Scope

**In scope** — maintenance operations under Administration: ticket lifecycle,
technician trades and assignment, escalation, feedback and ratings, campus and
organisation-wide reporting.

**Out of scope** — ICT, HR, Procurement, Finance and other departmental service
desks.

**Future** — Security, Transport, Telephone Exchange, Staff Housing, Cleaning
Services. The architecture should absorb these without redesign.
