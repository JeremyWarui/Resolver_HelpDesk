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
├── backend/     Django 6.0 + DRF 3.16 + PostgreSQL + Channels
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

**Phase 2 — Architecture Audit.** No refactoring has begun. The audit
deliverables live in `docs/` and must be reviewed before any code changes.

## Getting started

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in DB + secret values
python manage.py migrate
python manage.py runserver
pytest                        # add --create-db after model changes
```

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
technician skills and assignment, escalation, feedback and ratings, campus and
organisation-wide reporting.

**Out of scope** — ICT, HR, Procurement, Finance and other departmental service
desks.

**Future** — Security, Transport, Telephone Exchange, Staff Housing, Cleaning
Services. The architecture should absorb these without redesign.
