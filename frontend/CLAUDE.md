# CLAUDE.md — Resolver Frontend

> **Kenya School of Government — Multi-Campus Service Desk System**
> React 19 · TypeScript · Vite · shadcn/ui · Tailwind CSS 4 · Zustand · React Query
>
> **Aligned with the backend implementation plan.** The Django Resolver API is the
> authoritative engine: it owns routing, priority, SLA timing, and escalation. This
> frontend renders state and triggers actions — it never computes those things. Read
> **§2 System Behaviour Contract** before changing any ticket, catalogue, or analytics code.

---

## 1. Project Overview

The Resolver frontend is a role-gated SPA providing six distinct dashboards — one per user role. It is the sole consumer of the Django Resolver REST API. Each role sees a scoped view of tickets: from a regular user's personal ticket list to a manager's cross-campus overview. **Role scoping is enforced server-side**; the UI mirrors it for UX only.

**Dev**: `http://localhost:5173`
**Prod**: `https://django-resolver.onrender.com` (backend) — frontend hosted on Vercel.

---

## 2. System Behaviour Contract (READ FIRST)

The backend is the authoritative engine. The rules below are derived from the backend
implementation plan and are **binding** on the frontend. Where the current codebase
violates one, see **§28 Reconciliation & Removal**.

### 2.1 The org model the UI reflects
- Departments are **global**; each is led by a **Manager**.
- A department is instanced per campus as a **Campus Department**, headed by an **HOD**.
- A campus department contains **Sections** — campus-local instances of a global **Section Type** — each headed by an **HOS** and staffed by **Technicians**.
- Leadership is three parallel relationships: Manager→Department, HOD→CampusDepartment, HOS→Section. The UI shows the holder; **changing a holder is a data edit, not a workflow change**.

### 2.2 Routing is server-side (never client-side)
- A ticket's handling **Section** is resolved by the backend from `(requester's campus, service_item → category → section_type)`.
- The create form sends **only** `service_item` (+ optional location). It must **not** send `section_id`, `priority`, `current_level`, or any due date.
- The catalogue in the create form is **campus-filtered**: only categories/items actually served at the requester's campus appear (`GET /catalog/`). Never render a flat, global catalogue in the create flow.

### 2.3 Priority ≠ SLA ≠ escalation level — three independent things
- **Priority** is a backend entity (e.g. low/medium/high). It is **server-defaulted** from the chosen service item/category. **Requesters can never set or change priority.** Only HOS+ may adjust it via `POST /tickets/{id}/priority/`.
- **SLA** timers (`response_due_at`, `resolution_due_at`) are computed and owned by the backend.
- **Escalation level** (`current_level`: `technician → hos → hod`) is a **separate axis from status**, advanced automatically by the backend SLA job. The UI **displays** it; it never computes or infers it.

### 2.4 Status lifecycle (canonical values)
`open → assigned → in_progress → pending → resolved → closed`, plus reopen (`resolved | closed → in_progress`).
- The canonical paused value is **`pending`** (the wire value; label reads "Pending"). The SLA clock freezes while `pending`.
- Moving to `pending` **requires a reason**, sent with the transition.
- There is **no approval / approve-reject transition** and **no `escalated` status** in the lifecycle — escalation is the `current_level` axis. Approve/reject is removed entirely (see §28).

### 2.5 The SLA clock pauses on hold
- While `status === 'pending'` the SLA clock is **frozen**; the backend shifts due dates on resume. `SLACountdown` must render a **Paused** state for pending tickets, not a running countdown. At-risk / breach styling comes from server-provided timestamps and flags, **not client math**.

### 2.6 Assignment is pool-scoped
- HOS/HOD may assign a ticket only to technicians in **that ticket's section pool**. The technician picker must be scoped to the ticket's section, never the global technician list.

### 2.7 Location is facility-backed and conditional
- The location step appears **only** when the selected category has `location_details === true`.
- The user picks a facility **type**, then a **hardcoded form for that type** renders its fields (the type set is small and fixed — no dynamic schema). Building-dropdown types (office_block, building) pick a campus-scoped **Facility**; others are plain inputs. Submit `{ facility_type_id, facility_id?, values }`. **No free-text building names; no `field_schema`/`DynamicFormRenderer`.**

### 2.8 Timeline = three sources, one view
- `TicketTimeline` merges **TicketLog** (immutable audit), **TicketComment** (public/internal), and **TicketFeedback** into one chronological view.
- **Internal comments are hidden from the `user` (requester) role.**
- **Feedback** (rating + comment) is submitted **once**, only when the ticket is `resolved`+, by the **requester**.

### 2.9 The frontend must NEVER
- Send priority, section, escalation level, or due dates on ticket **create**.
- Let a requester set priority or assignee.
- Compute SLA compliance, routing, or escalation **client-side**.
- Render a per-campus **"workflow"** editor — the ladder is structural.
- Show a flat, non-campus-filtered catalogue in the create flow.
- Show internal comments to requesters.

### 2.10 Ticket display label is `service_item.name` — there is no `title` field
The `Ticket` model has **no `title` field**. The human-readable label for a ticket is
`ticket.service_item.name` (fall back to `ticket.description` if absent). Never access
`ticket.title` — it returns `undefined` and will crash table columns and detail views. All
ticket-title columns must use `accessorFn` to read `service_item.name`. All text-truncation
utilities must be null-safe.

---

## 3. Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| React | 19 | UI runtime |
| TypeScript | 6.x | Type safety |
| Vite | 8.x | Build + dev server |
| Tailwind CSS | 4.x | Utility styling |
| shadcn/ui | (component registry) | Pre-built accessible components |
| @radix-ui/* | various | Headless primitives under shadcn |
| react-router-dom | 7.x | Client-side routing |
| axios | 1.x | HTTP client |
| @tanstack/react-query | 5.x | Server state — all API data |
| zustand | 5.x | Client UI state — auth, notifications, UI |
| react-hook-form | 7.x | Form state |
| zod | 4.x | Schema validation |
| @tanstack/react-table | 8.x | Data tables |
| recharts | 3.x | Charts |
| sonner | 2.x | Toast notifications |
| lucide-react | 1.x | Icons |
| next-themes | 0.4.x | Dark-mode theme switching |

**No additional UI libraries.** Build new components with Radix + Tailwind.

---

## 4. State Management Architecture

**Rule: Zustand = client UI state. React Query = server/async data.**

### Zustand stores (`src/stores/`)

| Store | Purpose |
|-------|---------|
| `authStore.ts` | Current user object, token, `isAuthenticated`, `setUser`, `clearUser` |
| `notificationStore.ts` | In-app notification list, unread count, mark-read actions |
| `uiStore.ts` | UI-only state (sidebar open, theme preference, etc.) |

Reading auth user anywhere: `const userData = useAuthStore(s => s.user)` — synchronous, no loading state.

### React Query (`@tanstack/react-query`)

All server data is fetched via React Query hooks. No Context.Provider wrappers are used for API data — React Query deduplicates by `queryKey` automatically.

The QueryClient is created in `main.tsx` with `staleTime: 5 * 60 * 1000` as default. Individual hooks override `staleTime` as appropriate.

**Do not** create Context providers that wrap API calls. **Do not** re-introduce `SharedDataContext`, `UserDataContext`, or dashboard context providers — they have been fully replaced.

---

## 5. Directory Layout

> Files marked `# ⚠`/`# ⟳` are affected by the alignment — see **§28**.

```
client/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── package.json
├── components.json              # shadcn/ui registry config
└── src/
    ├── main.tsx                 # Entry: QueryClientProvider → RoleProvider → App
    ├── App.tsx                  # BrowserRouter + lazy routes
    ├── index.css                # Global styles + Tailwind base
    │
    ├── app/                     # App-level shell components
    │   ├── auth/
    │   │   ├── AuthWrapper.tsx  # Post-login redirect based on role
    │   │   ├── LoginForm.tsx
    │   │   ├── RegisterForm.tsx
    │   │   └── ProtectedRoute.tsx
    │   ├── dashboard/
    │   │   ├── DashboardShell.tsx   # Parent of all protected routes; bootstraps useUserData() + WS
    │   │   ├── analytics/
    │   │   │   └── AnalyticsDashboard.tsx
    │   │   └── tickets/
    │   │       └── TicketDetailPage.tsx
    │   └── errors/
    │       └── NotFoundPage.tsx
    │
    ├── features/                # Role-scoped feature modules
    │   ├── admin/
    │   │   ├── AdminLayout.tsx
    │   │   ├── AuditLogPage.tsx
    │   │   ├── ContextConfigEditor.tsx   # ⚠ remove/repurpose — no per-campus workflow/context config
    │   │   ├── OrganisationAnalytics.tsx
    │   │   ├── ServicesPage.tsx
    │   │   ├── SLARulesPage.tsx          # ⟳ align — Priority + EscalationRule rungs (not flat numbers)
    │   │   ├── UsersPage.tsx             # role-grouped collapsible table + Campus/Department filters (§10)
    │   │   ├── WorkflowsPage.tsx         # ⚠ REMOVE — ladder is structural, not configured
    │   │   ├── Campuses/        # CampusesPage.tsx
    │   │   ├── Catalogue/       # CataloguePage.tsx — ItemForm has an optional per-item priority override (inherits category by default)  # ⟳ category has no department FK
    │   │   ├── Dashboard/       # DashboardLayout, ChartsSection, RecentTickets,
    │   │   │                    #   TechniciansWorkload, FacilityAndWorkload, FacilityChart
    │   │   ├── Departments/     # DepartmentsPage.tsx
    │   │   ├── Facilities/      # FacilitiesPage, FacilitiesTable, FacilityDetails, FacilityForm
    │   │   ├── Reports/         # ReportsPageEnhanced, GenerateReports, metric report components
    │   │   ├── Sections/        # SectionsPage, SectionsTable, SectionDetails, SectionForm  # ⟳ campus instance
    │   │   ├── Technicians/     # TechniciansPage, TechniciansTable, TechnicianDetails, TechnicianForm
    │   │   └── TicketsPage/     # TicketsPage.tsx, TicketsTable.tsx
    │   │
    │   ├── analytics/
    │   │   └── SLATrackingView.tsx       # ⟳ bind to /analytics/* — no client SLA math
    │   │
    │   ├── shared/               # role-parametrized views (Admin = canonical template, plan §6.1)
    │   │   ├── RoleDashboardView.tsx     # dashboard homepage; role: 'admin'|'manager'|'hod'|'hos'
    │   │   ├── RoleAnalyticsView.tsx     # deep analytics page, same role union
    │   │   ├── RoleReportsPage.tsx       # reports landing (tabs + Quick Access + Excel export)
    │   │   └── RoleTicketsPage.tsx
    │   │
    │   ├── hod/
    │   │   ├── HODLayout.tsx
    │   │   ├── HODDashboard.tsx
    │   │   ├── HODSections.tsx
    │   │   └── HODTechnicians.tsx
    │   │
    │   ├── hos/
    │   │   ├── HOSLayout.tsx
    │   │   ├── HOSDashboard.tsx
    │   │   ├── HOSTechnicians.tsx
    │   │   └── AssignmentModal.tsx       # ⟳ scope to ticket's section pool
    │   │
    │   ├── manager/
    │   │   ├── ManagerLayout.tsx
    │   │   ├── ManagerDashboard.tsx
    │   │   ├── ManagerAnalytics.tsx
    │   │   ├── ManagerCampusBreakdown.tsx
    │   │   ├── ManagerSectionPerformance.tsx
    │   │   ├── ManagerStatsCards.tsx
    │   │   ├── ManagerStatusDistribution.tsx
    │   │   ├── ManagerTechnicianWorkload.tsx
    │   │   └── ManagerTickets.tsx        # ⚠ remove approve/reject unless backend adds an approval step
    │   │
    │   ├── technician/
    │   │   ├── TechnicianLayout.tsx
    │   │   ├── TechSectionTickets.tsx
    │   │   ├── TechTickets.tsx
    │   │   ├── TechTicketsPage.tsx
    │   │   ├── TechReport.tsx
    │   │   ├── TechnicianStatsCards.tsx
    │   │   └── StatusUpdateModal.tsx     # ⟳ pending requires a reason
    │   │
    │   ├── tickets/
    │   │   ├── TicketQueue.tsx  # Operational queue (technician / HOS / HOD)
    │   │   └── EscalationModal.tsx       # ⟳ current_level server-owned; never client-computed
    │   │
    │   └── user/
    │       ├── UserLayout.tsx
    │       ├── UserDashboard.tsx
    │       ├── MyTicketsPage.tsx
    │       ├── QuickActions.tsx
    │       └── RatingModal.tsx           # ⟳ once, resolved+, requester only
    │
    ├── components/
    │   ├── ui/                  # shadcn-generated primitives — do not edit manually
    │   ├── layout/
    │   │   ├── RoleLayout.tsx   # Shared sidebar + header wrapper for all roles
    │   │   └── AppSidebar.tsx
    │   └── shared/
    │       ├── ComingSoonSection.tsx
    │       ├── LazyMount.tsx    # defers mounting children until scrolled near viewport (§19)
    │       ├── data/
    │       │   ├── AdminResourceTable.tsx
    │       │   ├── AppBarChart.tsx
    │       │   ├── AppPieChart.tsx
    │       │   ├── ChartCard.tsx
    │       │   ├── ChartPlaceholder.tsx
    │       │   ├── FilterPills.tsx      # Canonical filter pill component
    │       │   ├── KPICardGrid.tsx
    │       │   ├── MetricCard.tsx
    │       │   ├── RoleStatsGrid.tsx
    │       │   ├── SLAComplianceGauge.tsx        # ⟳ bind to /analytics/sla-compliance
    │       │   ├── TechnicianPerformanceTable.tsx# ⟳ bind to /analytics/performance/technicians
    │       │   ├── TicketVolumeChart.tsx         # ⟳ bind to /analytics/* — no client aggregation
    │       │   ├── DataTable/
    │       │   │   ├── DataTable.tsx
    │       │   │   └── utils/
    │       │   │       ├── FilterUtils.tsx
    │       │   │       ├── TableContent.tsx
    │       │   │       ├── TableHeaders.tsx
    │       │   │       ├── TableUtils.tsx
    │       │   │       ├── TicketColumnVisibility.tsx
    │       │   │       ├── TicketTableColumns.tsx
    │       │   │       └── TicketTableFilters.tsx
    │       │   └── StatCards/
    │       │       ├── index.ts
    │       │       ├── StatCardsRenderer.tsx
    │       │       ├── AdminStatsCards.tsx
    │       │       ├── HODStatsCards.tsx
    │       │       ├── ManagerStatsCards.tsx
    │       │       ├── SectionHeadStatsCards.tsx
    │       │       ├── TechnicianStatsCards.tsx
    │       │       └── UserStatsCards.tsx
    │       ├── feedback/
    │       │   ├── ConfirmDialog.tsx
    │       │   ├── FullScreenLoading.tsx
    │       │   └── NotificationItem.tsx
    │       ├── forms/
    │       │   ├── FacilityTypeForms/            # ⟳ one hardcoded form per facility type (no DynamicFormRenderer)
    │       │   ├── FacilityLocationSelector.tsx  # ⟳ facility (campus-scoped) + schema; no free text
    │       │   ├── FilterPanel.tsx
    │       │   ├── FormDialog.tsx
    │       │   ├── SearchBar.tsx
    │       │   └── TechnicianPicker.tsx          # ⟳ scope to ticket's section pool
    │       └── ticket/
    │           ├── ApproveRejectActions.tsx      # ⚠ remove unless backend adds approval step
    │           ├── CommentThread.tsx             # ⟳ public/internal; hide internal from requester
    │           ├── PriorityBadge.tsx             # ⟳ render server priority; read-only to requester
    │           ├── RatingWidget.tsx              # ⟳ once, resolved+, requester only
    │           ├── SLACountdown.tsx              # ⟳ Paused state when pending; no client math
    │           ├── StatusBadge.tsx               # ⟳ pending (label "Pending"); drop pending_approval/escalated/rejected
    │           ├── TicketCreationWizard.tsx      # ⟳ catalogue tree + service_item only (no priority/section)
    │           ├── TicketDetailModal.tsx
    │           ├── TicketTable.tsx               # Canonical ticket table — all roles/variants
    │           ├── TicketTimeline.tsx            # ⟳ merge log + comments + feedback
    │           └── UnifiedDetailsSheet.tsx
    │
    ├── hooks/
    │   ├── useAuth.ts           # Auth state from localStorage
    │   ├── useDepartments.ts    # Campus-filtered departments (used by TechnicianForm)
    │   ├── useLogout.ts         # Clears auth, navigates to /login
    │   ├── useServiceCategories.ts   # ⟳ admin catalogue mgmt; create flow uses useCatalog (campus-filtered)
    │   ├── useServiceItems.ts        # ⟳ as above
    │   ├── useSortableColumn.tsx
    │   ├── useInView.ts         # "freeze once visible" IntersectionObserver — backs LazyMount (§19)
    │   ├── useWsChannels.ts     # WebSocket channel subscriptions
    │   ├── analytics/           # useAdminAnalytics, useRoleAnalytics,
    │   │                        #   useTechnicianAnalytics, useTicketAnalytics
    │   ├── campuses/            # useCampuses
    │   ├── catalog/             # ⟳ ADD useCatalog(campusId) — campus-filtered category→item tree
    │   ├── dashboard/           # useAdminDashboard, useHODDashboard, useManagerDashboard,
    │   │                        #   useSectionHeadDashboard, useTechnicianDashboard, useUserDashboard
    │   ├── departments/         # useDepartments (React Query)
    │   ├── facilities/          # useFacilities, useManageFacilities
    │   ├── sections/            # useSections
    │   ├── technicians/         # useTechnicians  (+ useSectionTechnicians(sectionId) for assignment)
    │   ├── tickets/             # useTickets, useTicketTable, useTicketDetail,
    │   │                        #   useCreateTicket, useUpdateTicket, useTicketStatus,
    │   │                        #   useAssignTicket, useTicketPriority, useTicketFeedback,
    │   │                        #   useTicketComments, useTicketFilters, index.ts
    │   └── users/               # useUsers, useUserData, useCreateUser, useUpdateUser
    │
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts        # Axios instance (token injection + 401 redirect)
    │   │   ├── admin.ts
    │   │   ├── analytics.ts
    │   │   ├── auth.ts
    │   │   ├── catalogue.ts     # ⟳ add getCatalog(campusId) → campus-filtered tree
    │   │   ├── dashboard.ts
    │   │   ├── notifications.ts
    │   │   ├── organizations.ts # Sections, campuses, departments, facilities, section types
    │   │   ├── reports.ts
    │   │   ├── services.ts      # Service categories + items (catalogue write operations)
    │   │   ├── technicians.ts
    │   │   ├── tickets.ts       # ⟳ add status/assign/priority/comments/feedback/logs actions
    │   │   ├── users.ts
    │   │   └── index.ts         # Re-exports
    │   ├── auth/
    │   │   ├── permissions.ts
    │   │   └── roleContext.tsx
    │   ├── ws/
    │   │   └── wsClient.ts      # WebSocket client; invalidates React Query on events
    │   └── utils.ts             # cn() utility
    │
    ├── stores/
    │   ├── authStore.ts
    │   ├── notificationStore.ts
    │   └── uiStore.ts
    │
    ├── types/
    │   ├── index.ts             # Barrel re-export of all types
    │   ├── admin.types.ts
    │   ├── analytics.types.ts
    │   ├── catalogue.ts
    │   ├── facility.types.ts
    │   ├── hod.types.ts
    │   ├── manager.types.ts
    │   ├── organisationStructure.ts
    │   ├── sectionHead.types.ts
    │   ├── section.types.ts
    │   ├── shared.types.ts
    │   ├── technician.types.ts
    │   ├── ticket.types.ts      # ⟳ status pending, priority object, current_level, due dates, location
    │   └── user.types.ts
    │
    ├── constants/
    │   ├── tickets.ts           # Status labels, priority labels, status badge colours
    │   ├── statCardsConfig.ts   # Stat card definitions per role
    │   ├── sidebarConfig.ts     # Sidebar nav items per role  # ⚠ drop Workflows nav entry
    │   └── detailsSheetConfig.ts
    │
    └── utils/
        ├── cn.ts
        ├── date.ts
        ├── entityValidation.ts  # Zod schemas for admin forms
        ├── formatSection.ts     # formatSectionDisplay(), formatSectionObj()
        ├── handleDRFError.ts
        ├── ticketHelpers.ts
        └── ticketValidation.ts  # ⟳ create schema: service_item (+location) only
```

---

## 6. Router & Navigation

`src/App.tsx` defines all routes with lazy loading inside a `<Suspense>` boundary:

```tsx
const AdminLayout    = lazy(() => import('./features/admin/AdminLayout'));
const UserLayout     = lazy(() => import('./features/user/UserLayout'));
const TechnicianLayout = lazy(() => import('./features/technician/TechnicianLayout'));
const HOSLayout      = lazy(() => import('./features/hos/HOSLayout'));
const HODLayout      = lazy(() => import('./features/hod/HODLayout'));
const ManagerLayout  = lazy(() => import('./features/manager/ManagerLayout'));
```

### Route → role mapping

| Path prefix | Required role |
|-------------|--------------|
| `/dashboard/*` | `admin` |
| `/user/*` | *(any authenticated user)* |
| `/technician/*` | `technician` |
| `/section-head/*` | `head_of_section` |
| `/hod/*` | `hod` |
| `/manager/*` | `manager` |

All protected routes are wrapped in `<DashboardShell>` which bootstraps user data and WebSocket.

> **Rule (C5/C6):** `/user/*` must use `requiredRoles={[]}` (empty array = any authenticated
> user). Every authenticated user is a requester regardless of operational role. Users whose JWT
> `role` is `null` (no `RoleAssignment`) must reach `/user` after login — the role-redirect
> fallback must be `/user`, not `/dashboard`. Never gate the My Requests workspace on a non-null
> role.

### Role-based post-login redirect (`AuthWrapper.tsx`)

```tsx
const ROLE_PATHS: Record<UserRole, string> = {
  admin: '/dashboard',
  user: '/user',
  technician: '/technician',
  head_of_section: '/section-head',
  hod: '/hod',
  manager: '/manager',
};
```

---

## 7. Auth Flow

**Storage**: Token stored in `localStorage` under key `authToken`. Auth store (Zustand) persists token only across page reloads — user profile is re-hydrated on mount.

**Lifecycle:**

1. `lib/api/auth.ts` → POST `/api/auth/login/` → stores token + calls `authStore.setUser(user, token)`
2. `useAuth()` reads from localStorage on mount for initial gate
3. `DashboardShell` calls `useUserData()` — hydrates auth store from the login-time profile in localStorage (no API call); calls `GET /auth/me/` only when a forced refresh is needed
4. All components read user via `useAuthStore(s => s.user)` — synchronous, no loading state
5. Axios request interceptor: `Authorization: Token <token>` on every request
6. Response interceptor: on 401 → `logout()` → redirect to `/login`

> The user profile carries the requester's **campus** — used to drive the campus-filtered catalogue (§2.2) and to scope reads. The frontend never sends campus on ticket create; the server reads it from the authenticated user.

> **Rule (C2):** There is **no `/api/v1/users/<id>/` endpoint**. `useUserData` must NOT call a
> user-detail URL — it does not exist and returns 404. Hydrate the auth store directly from the
> login-time profile stored in localStorage. When a fresh profile is needed (e.g. after
> `switch-role`), call `GET /auth/me/` (`MeView`). Do not invent or call a user-detail endpoint.

### Key auth files

| File | Purpose |
|------|---------|
| `lib/api/auth.ts` | login, logout, register, getCurrentUser |
| `lib/api/client.ts` | Axios instance — token injection + 401 handling |
| `hooks/useAuth.ts` | Reads localStorage for initial auth state |
| `hooks/useLogout.ts` | Calls logout() + navigate to /login |
| `hooks/users/useUserData.ts` | React Query — fetches profile, hydrates authStore |
| `stores/authStore.ts` | Zustand — user, token, isAuthenticated |
| `app/auth/ProtectedRoute.tsx` | Role gate wrapper |
| `app/auth/AuthWrapper.tsx` | Post-auth role-based redirect |
| `app/dashboard/DashboardShell.tsx` | Calls useUserData() + useWsChannels() |

---

## 8. Role-Based Dashboards

Each role has its own layout file in `src/features/<role>/`. Layout files call `useAuthStore(s => s.user)`, call the role-specific dashboard hook for loading state, and render child pages based on `activeSection` state. **All ticket reads come from one shared, role-scoped source** (see §17) — do not duplicate ticket tables per role.

### Dashboard features by role (mirrors backend role scope)

| Role | Layout file | Key views | Backend scope |
|------|------------|-----------|---------------|
| `user` | `features/user/UserLayout.tsx` | My tickets, raise ticket (wizard), dashboard | own tickets only |
| `technician` | `features/technician/TechnicianLayout.tsx` | Assigned queue, section queue, report | `assigned_to == self` or own section(s) |
| `head_of_section` | `features/hos/HOSLayout.tsx` | Section overview, assign/reassign (pool), technicians | sections where `hos == self` |
| `hod` | `features/hod/HODLayout.tsx` | Campus-dept overview, sections, technicians, analytics | campus dept where `hod == self` |
| `manager` | `features/manager/ManagerLayout.tsx` | Cross-campus dept view, campus comparison, analytics | department across all campuses |
| `admin` | `features/admin/AdminLayout.tsx` | Full system — tickets, users, org structure, catalogue, SLA, facilities, reports | global |

> Removed from the manager scope vs the old build: **approve/reject** (no approval transition in the lifecycle — see §28).

---

## 9. Dashboard Hooks (`src/hooks/dashboard/`)

One React Query hook per role, all following the same pattern; they back the per-role
dashboards and should read from the role-scoped backend endpoints (`/analytics/*` for
aggregates — never compute aggregates client-side).

```ts
export function useAdminDashboard(days = 30) {
  const { data, isLoading, error, refetch } = useQuery<AdminDashboard>({
    queryKey: ['dashboard', 'admin', days],
    queryFn: () => getAdminDashboard(days),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}
```

| Hook | Days param |
|------|-----------|
| `useAdminDashboard(days?)` | yes |
| `useHODDashboard(days?)` | yes |
| `useManagerDashboard(days?)` | yes |
| `useSectionHeadDashboard(days?)` | yes |
| `useTechnicianDashboard()` | no |
| `useUserDashboard()` | no | calls `GET /analytics/overview/` — scoped to requester automatically |

Import from the barrel: `import { useManagerDashboard } from '@/hooks/dashboard'`.

---

## 10. Reference Data Hooks

All reference data uses React Query. Multiple components sharing the same `queryKey` share one cached result — no provider needed:

| Hook | staleTime | Notes |
|------|-----------|-------|
| `useSections()` | 5 min | |
| `useCampuses()` | 10 min | |
| `useDepartments()` | 10 min | |
| `useFacilities(campusId?)` | 5 min | campus-scoped for the location selector |
| `useTechnicians(filters?)` | 2 min | global list (admin/management) |
| `useSectionTechnicians(sectionId)` | 2 min | **assignment pool** for a ticket's section (§2.6) |
| `useCatalog(campusId)` | 5 min | **campus-filtered** category→item tree for the create flow (§2.2); requires `campusId != null` — comes from `primary_campus_id` which `flattenJWT` reads from the JWT `campus_id` claim (C9) |
| `useUsers(params?, skip?)` | 3 min | |
| `useUserData()` | 10 min | |

Call hooks directly in the component that needs them. **Do not** wrap them in a provider.

> **Rule (C15):** `useDepartments()` (`hooks/departments/useDepartments.ts`) returns the **global**
> `Department[]` list — the same `DepartmentSerializer` shape used everywhere — and each entry now
> carries a `campuses: { campus_department_id, id, name, code }[]` field (every campus that
> department has a `CampusDepartment` presence on). To narrow a Department dropdown by a selected
> campus, filter client-side on `d.campuses?.some(c => c.id === campusId)` — do **not** rely on the
> `?campus=` query param on a hook using the campus-scoped variant (`useDepartments(campusId)` in
> `hooks/useDepartments.ts`, or `departmentsService.getCampusDepartments`) unless you've confirmed
> `DepartmentViewSet.get_queryset()` still applies it server-side (it does as of C15 — see the SoT —
> but don't assume a query param is honoured without checking `get_queryset()`).

> **Rule (C4):** Reference/config endpoints consumed by requester UI (departments, section types,
> catalogue) must be readable by **any authenticated user**. The backend uses `IsAdminOrReadOnly`
> on `DepartmentViewSet` and `SectionTypeViewSet` — safe methods are open to all authenticated
> users; write methods require admin. If a hook in this table returns 403 for a non-admin user,
> the backend permission class is wrong, not the frontend. `SectionTypeViewSet` also exposes a
> nested serializer (`SectionTypeWithCategoriesSerializer`) that includes related
> `service_categories`, used by QuickActions widgets.

---

## 11. API Layer (`src/lib/api/`)

### Axios instance (`lib/api/client.ts`)

Single shared instance. Token attached per request. On 401 → clears auth + redirects to `/login`.

### Base URL selection

```ts
// dev  → VITE_API_URL_DEV  || 'http://localhost:8000/api/v1'
// prod → VITE_API_URL_PROD || 'https://django-resolver.onrender.com/api/v1'
```

> **Rule (C3):** The `apiClient` base URL must end in `/api/v1`. All main endpoints
> (`/tickets/`, `/analytics/`, `/catalog/`, `/facilities/`, `/departments/`,
> `/section-types/`, etc.) live under `/api/v1/`. Auth endpoints (`/auth/login/`,
> `/auth/refresh/`, `/auth/me/`, `/auth/switch-role/`) are registered at **both** `/api/`
> and `/api/v1/`, so they work regardless. Never use `/api` (without the version suffix)
> as the base URL — all CRUD calls will 404.

### Service pattern

Services export named async functions or a default object. They never catch errors — callers handle via `toast`.

**Ticket feed + config lists** → PageNumber: `{ count, next, previous, results }` → use `.results`; page-number controls; ticket feed is ordered `-updated_at` (recently-touched first). **Append-only timelines (logs/comments/audit)** → cursor: `{ results, meta:{ nextCursor, prevCursor, total } }` → use `.results`, navigate via `meta.nextCursor`/`prevCursor`, may show `meta.total`.
**Detail responses** → object directly → use `.data`.

### Key ticketing endpoints (align `lib/api/tickets.ts` + `catalogue.ts`)

| Function | Method · Path | Notes |
|----------|---------------|-------|
| `getCatalog(campusId)` | GET `/catalog/?campus=` | campus-filtered tree (§2.2) |
| `getFacilities(campusId)` | GET `/facilities/?campus=&facility_type=` | building rows for the location dropdown |
| `createTicket(payload)` | POST `/tickets/` | **`service_item` (+location) only** (§2.2) |
| `getTickets(params)` | GET `/tickets/` | role-scoped server-side |
| `getTicket(id)` | GET `/tickets/{id}/` | detail + merged timeline |
| `updateStatus(id, body)` | POST `/tickets/{id}/status/` | reason required for `pending` |
| `assignTicket(id, body)` | POST `/tickets/{id}/assign/` | pool-scoped (§2.6) |
| `setPriority(id, body)` | POST `/tickets/{id}/priority/` | HOS+ only (§2.3) |
| `getComments(id)` / `addComment(id, body)` | GET/POST `/tickets/{id}/comments/` | visibility-aware |
| `addFeedback(id, body)` | POST `/tickets/{id}/feedback/` | once, resolved+ (§2.8) |
| `getLogs(id)` | GET `/tickets/{id}/logs/` | immutable audit |
| analytics | GET `/analytics/*` | aggregates computed server-side (§20) |

---

## 12. Type System

All types in `src/types/`. Import via barrel:

```ts
import type { Ticket, User, UserRole, Section, Facility, Technician, Priority } from '@/types';
```

### Key types

**`UserRole`** (`user.types.ts`):
```ts
type UserRole = 'user' | 'technician' | 'head_of_section' | 'hod' | 'manager' | 'admin';
// 'user' == requester. 'head_of_section' == HOS.
```

**`Ticket`** (`ticket.types.ts`) key fields — aligned to the backend:
```ts
interface Ticket {
  id: number;
  ticket_no: string;            // human ticket id (canonical field name; NOT `reference`)
  status: 'open' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'closed';
  priority: Priority;           // SERVER-SET object { id, name, rank }; requester never sets it (§2.3)
  current_level: 'technician' | 'hos' | 'hod';   // escalation axis — server-owned, ≠ status (§2.3)
  section: { id: number; section_type_id: number; section_type_name: string }; // resolved server-side (C11); display name is section_type_name
  raised_by: string;           // the raiser (username string); FK is `raised_by`, NOT `requester`
  assigned_to: AssignedUser | null;
  response_due_at: string | null;
  resolution_due_at: string | null;
  paused_at: string | null;    // non-null ⇒ SLA frozen (status pending) (§2.5)
  location?: TicketLocation | null;
}

interface TicketLocation {
  facility_type: NestedRef;          // always present (the chosen type)
  facility: NestedRef | null;        // set only for building-dropdown types (office_block, building)
  values: Record<string, unknown>;   // per-type fields (validated server-side against the type's known set)
}
```

**Create payload** — only what the server cannot derive:
```ts
interface CreateTicketPayload {
  service_item_id: number;
  description: string;
  location?: { facility_type_id: number; facility_id?: number; values: Record<string, unknown> };
  // NO section_id, NO priority, NO campus, NO current_level — all server-derived (§2.2/§2.3)
}
```

**Write payloads** use `_id` suffix for FK fields (`facility_id`, `assigned_to_id`, etc.). The exception is ticket **create**, which is constrained to the shape above.

> `priority` is **not** a free string union on writes. The string enum (`low|medium|high|critical`) survives only as a display/label convenience in `constants/tickets.ts`; the source of truth is the backend `Priority` entity. Remove any `ServiceCategory.department` field from `catalogue.ts` types — department derives from the section type (§28).

---

## 13. Ticket Creation Flow (`TicketCreationWizard.tsx`)

The wizard is the canonical create path and must follow §2.2/§2.3/§2.7:

1. **Service** — load the campus-filtered tree via `useCatalog(userData.campusId)`; user picks a **category**, then a **service item**. No global/flat catalogue. `campusId` must be non-null; it comes from `primary_campus_id` on the auth store, which `flattenJWT` populates from the JWT `campus_id` claim (always present for all users — see C9/C10). If `campusId` is null the hook is skipped and the wizard shows nothing.
2. **Location (conditional)** — render **only** if the chosen category has `location_details === true`. Pick a facility type, then render that type's **hardcoded form** (a switch over the fixed type set). Building-dropdown types load `useFacilities(campusId, type)`; others are plain inputs. Collect `{ facility_type_id, facility_id?, values }`.
3. **Details** — description (and any non-routing fields).
4. **Submit** — `useCreateTicket()` posts `CreateTicketPayload`. **Priority, section, and SLA are not collected** — the server sets them and returns the created ticket with `priority`, `section`, `current_level`, and due dates populated.

`utils/ticketValidation.ts` zod schema for create validates `service_item_id`, `description`, and the conditional `location` only — it must not contain `priority` or `section`.

---

## 14. Ticket Lifecycle, SLA & Escalation (frontend)

### Status machine (display + transition gating)
Allowed transitions (mirror the backend; gate the action buttons accordingly):
`open→assigned`, `assigned→in_progress`, `in_progress→pending`, `pending→in_progress`,
`in_progress→resolved`, `resolved→closed`, and reopen `resolved|closed→in_progress`.

- `StatusBadge` renders the status; `pending` displays as "Pending". Drop any `pending_approval`/`escalated`/`rejected` values.
- `StatusUpdateModal`: moving to `pending` **requires a reason** (sent to `/tickets/{id}/status/`). Do not allow a blank reason.
- There is **no** approve/reject action.

### SLA display (`SLACountdown`)
- Reads `response_due_at` / `resolution_due_at` from the ticket and renders a countdown.
- If `status === 'pending'` (or `paused_at` is set), render a **Paused** state — **do not** count down.
- At-risk / breached styling derives from the server timestamps/flags; **never** compute compliance client-side.

### Escalation level (`current_level`, `EscalationModal`)
- `current_level` is a **server-owned axis independent of status**. Display "currently with: Technician / HOS / HOD".
- Escalation is driven automatically by the backend SLA job. If a manual escalation action exists, it calls a backend endpoint to advance the level — the client **never** computes or sets the level locally.

### Assignment (`AssignmentModal`, `TechnicianPicker`)
- Populate the picker from `useSectionTechnicians(ticket.section.id)` — the ticket's section pool only (§2.6). Posting goes to `/tickets/{id}/assign/`.

---

## 15. Timeline, Comments & Feedback (`TicketTimeline.tsx`)

- The timeline is a single chronological merge of three backend sources: **logs** (`/tickets/{id}/logs/`, immutable audit — status/assignment/escalation/priority/hold), **comments** (`/tickets/{id}/comments/`, mutable, `public`/`internal`), and **feedback** (the resolution rating).
- `CommentThread`: respect `visibility`. **Internal comments are never shown to the `user` (requester) role.**
- `RatingModal` / `RatingWidget` (`/tickets/{id}/feedback/`): available **once**, only when the ticket is `resolved` or later, and only to the **requester**. Hide/disable otherwise.

---

## 16. Component Conventions

- One component per file; filename matches exported name.
- Use `cn()` from `@/lib/utils` for conditional classNames — never template literals.
- No inline styles — Tailwind only.
- Event handlers named `handle<Event>`.
- Always render loading state, error state, and empty state explicitly.
- No comments unless the WHY is non-obvious.

### shadcn/ui component usage
Import from `@/components/ui/<component>`. To add a new component: `npx shadcn add <component-name>`.

---

## 17. Ticket Table Hook (`useTicketTable`)

`hooks/tickets/useTicketTable.ts` is the single hook for all ticket tables. It fetches reference data directly via individual hooks and returns all state, data, and handlers needed for `DataTable`. **All roles use this one hook + `TicketTable`** — no per-role table reimplementations.

```ts
const table = useTicketTable({
  role: 'admin',
  currentUserId: userData?.id,
  defaultStatusFilter: 'all',
  defaultPageSize: 20,
  ordering: '-updated_at',
  // optional overrides: externalSections, externalTechnicians, externalFacilities, externalUsers
});
```

Server-side role scoping means the same hook is safe for every role; the backend returns only the rows that role may see.

---

## 18. Forms (react-hook-form + zod)

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
```

**shadcn `Select` with react-hook-form** — use `onValueChange`, not `register`:
```tsx
<Select onValueChange={val => field.onChange(Number(val))} value={String(field.value ?? '')}>
```

For facility location inputs, render the **hardcoded form for the chosen facility type** (the type set is fixed; no dynamic schema). Surface backend per-field validation errors via `handleDRFError`.

---

## 19. Tables & Charts

**Tables**: `@tanstack/react-table` v8 + shadcn `Table` primitives. Admin ticket tables use `DataTable` at `components/shared/data/DataTable/DataTable.tsx`.

**Charts**: `recharts` v3. Always wrap in `<ResponsiveContainer width="100%" height={300}>`. Parent must have defined height from CSS — never a fixed pixel height on the parent element.

**Deferred mounting (`LazyMount`)**: `components/shared/LazyMount.tsx` + `hooks/useInView.ts` defer mounting a block (and its recharts `ResponsiveContainer` layout measurement) until it scrolls within `rootMargin: 300px` of the viewport, rendering a `Skeleton` at a caller-supplied `minHeight` until then; once visible it mounts once and stays mounted ("freeze once visible" — scrolling away does not unmount it). Used on `RoleDashboardView`/`RoleAnalyticsView` (every block after the first chart row) and `RoleReportsPage` (the Overview tab's `ServiceHealthCards`). Rule: wrap blocks that are (a) below an already-visible first row and (b) either fetch their own data or render a recharts component — do not wrap static content (nav cards, instruction text) or the sole content of a single-tab view, since deferring something that's already in view on mount has no benefit.

---

## 20. Analytics (server-computed)

All aggregates — volumes, SLA compliance, resolution times, technician/section/campus performance — come from the backend `/analytics/*` endpoints (role-scoped, see plan §5.4). **The frontend must not compute SLA compliance or aggregate ticket data client-side.** Components bind to those endpoints and render. Analytics responses provide `display_name` pre-computed for sections — use `display_name ?? name`.

### 20.1 Two surfaces per role
Analytics appears in **both** places, fed by the backend's two tiers:
- **Landing-dashboard widget strip** — a compact set of headline widgets on each role's main dashboard, bound to `GET /analytics/overview/` (the role-scoped preset, default 30-day window). Anchored by the four health headlines: **SLA compliance (response + resolution), net flow / backlog, CSAT, reopen rate.** The overview response always includes `status_distribution` (the per-status breakdown array) — required by every role's stat-card total computation (C12/C13).
- **Dedicated analytics page** — a drill-in per role, bound to the deeper endpoints (`/sla-compliance/`, `/resolution-times/`, `/flow/`, `/quality/`, `/demand/`, `/performance/*`), with a date-range control and breakdowns.

The same scope + window must show the same numbers on both surfaces — they call the same backend core; never re-aggregate one of them client-side.

### 20.2 Per-role scope (what each role's surfaces show)
The backend enforces scope; the UI mirrors it. Bind each role to its own view — do not show a role metrics it can't act on.
- **Requester (user):** no analytics page. Only their own open/resolved counts on My-Requests.
- **Technician:** TWO scopes kept visually distinct — **sectional (read-only context)** on the main dashboard + one half of the analytics page; **individual (their assigned)** on My-Tickets + the other half. Sectional numbers must never be labelled as the technician's own performance.
- **HOS:** section health + per-technician workload/fairness + at-risk/unassigned actionables.
- **HOD:** section-vs-section comparison within their campus-department + department headlines + demand by category.
- **Manager:** campus-vs-campus comparison + department trend + demand by campus. Comparative/trended only.
- **Admin:** org-wide overview + config-health signals.

### 20.3 Cross-cutting rules
- Every analytics surface has a **date-range control** wired to `date_from`/`date_to` (default last 30 days). Headline numbers show the **delta vs the prior window** the backend returns.
- Time metrics render as **p50 and p90** (the backend returns both) — never collapse them to a single "average," which discards the backend's most useful output.
- **Chart types: keep what the frontend already uses.** A frontend audit will catalogue the existing analytics components per role and map them to these endpoints; do not introduce a new charting approach — reuse the current one (`recharts`) and the existing component set, rebinding them to `/analytics/*`.

> The detailed per-role widget layout (which chart goes where) is determined by the **frontend analytics audit**, not prescribed here — this section defines the contract (surfaces, scope, binding, date-range/percentile rules) the audit and Phase 8 build against.

---

## 21. UI System

### Tailwind v4
Uses `@tailwindcss/vite` plugin. Theme tokens (colours) live in `src/index.css` as CSS variables. Always use semantic Tailwind utilities (`bg-background`, `text-foreground`, `border-border`) — no hardcoded hex values.

### Dark mode
`next-themes` `ThemeProvider` is mounted in `main.tsx`. Toggle via `useTheme()`.

### Icons
Use `lucide-react` exclusively: `import { Settings } from 'lucide-react'`.

---

## 22. Toast Notifications

```tsx
import { toast } from 'sonner';
toast.success('Done'); toast.error('Failed'); toast.warning('...'); toast.info('...');
```

`<Toaster richColors position="top-right" />` is mounted once in `App.tsx`.

---

## 23. Role Guards

```tsx
// Route-level
<ProtectedRoute requiredRoles={['admin', 'hod']}><Page /></ProtectedRoute>

// Inline
const userData = useAuthStore(s => s.user);
const canAssign = ['head_of_section', 'hod', 'manager', 'admin'].includes(userData?.role ?? '');
const canSetPriority = ['head_of_section', 'hod', 'manager', 'admin'].includes(userData?.role ?? '');
```

Guard the UI for UX only. **The API is the authoritative permission layer** — it independently enforces role scope, pool-scoped assignment, requester-can't-set-priority, and feedback-once rules.

---

## 24. Section Display Formatting

```ts
formatSectionDisplay(section) // → "NRB-ICT Support"   (ticket.section NestedRef + campus_code)
formatSectionObj(section)     // → "NRB-ICT Support"   (full Section object with campus?: NestedRef)
```

Import from `@/utils/formatSection` or `@/utils`. Analytics endpoints provide `display_name` pre-computed — use `display_name ?? name` as fallback. A **Section is a campus-local instance** (campus department + section type); the same section-type name (e.g. "Helpdesk") at two campuses is two distinct sections — always disambiguate by campus.

---

## 25. WebSocket

`lib/ws/wsClient.ts` manages the connection. `wsInit()` is called in `main.tsx` with a `queryClient.invalidateQueries` callback so real-time events bust React Query caches. `hooks/useWsChannels.ts` subscribes the current user to role-appropriate channels — called once inside `DashboardShell`. Events that must invalidate ticket caches: **assignment, status change, escalation (`current_level` change), priority change, new comment**.

---

## 26. Building & Deployment

```bash
npm run dev           # Vite dev server on :5173
npx tsc --noEmit      # Type check only
npx eslint src/       # Lint
npm run build         # tsc -b && vite build → dist/
npm run preview       # Preview production build
```

Environment variables (prefix all with `VITE_`):
```bash
VITE_API_URL_DEV=http://localhost:8000/api/v1
VITE_API_URL_PROD=https://django-resolver.onrender.com/api/v1
```

---

## 27. Common Pitfalls

**No context providers for API data.** Call hooks directly — React Query handles deduplication. `SharedDataContext`, dashboard contexts, and `UserDataContext` are deleted.

**Getting current user.** `useAuthStore(s => s.user)` — synchronous. `userData` may briefly be `null` on first mount; use `userData?.role ?? 'user'` as fallback.

**Token in localStorage.** `authStore` persists only the token; profile is re-fetched by `useUserData()` in `DashboardShell`.

**Axios response shape.** Ticket feed + config lists: PageNumber `{ count, results }` (ticket feed ordered `-updated_at`). Log/comment/audit timelines: cursor `{ results, meta:{nextCursor,prevCursor,total} }`. Both → use `.results`. Detail: object directly → use `.data`.

**Form `_id` vs nested object.** API returns nested objects on read; expects `_id` integers on write — **except ticket create**, which sends only `service_item_id` (+ location).

**Never send priority/section on create.** The server resolves the section and sets the priority. Sending them is ignored at best and a bug in the form at worst (§2.2/§2.3).

**`pending` is the paused status.** Wire value `pending`, label "Pending"; it freezes the SLA clock and requires a reason. There is no `on_hold`, `pending_approval`, `escalated`, or `rejected` status.

**Paused SLA.** When a ticket is `pending`, freeze the countdown — don't show it ticking. The backend shifts due dates on resume.

**Internal comments.** Filter `visibility === 'internal'` out for the `user` role.

**Assignment pool.** Pull technicians from the ticket's section (`useSectionTechnicians`), not the global list.

**No client-side SLA/escalation math.** Render server values; never compute compliance, routing, or `current_level` locally.

**TypeScript path alias.** `@/` maps to `src/`.

**Lazy route fallback.** New lazy routes must be inside the `<Suspense>` boundary in `App.tsx`.

**Ticket has no `title` field (C1).** `ticket.title` is always `undefined`. The display label is `ticket.service_item.name` (fall back to `ticket.description`). Table columns for the ticket title must use `accessorFn`, not `accessorKey: 'title'`. Text-truncation helpers must be null-safe.

**No `/api/v1/users/<id>/` endpoint (C2).** Calling a user-detail URL returns 404. Use JWT claims / localStorage profile for initial hydration; call `GET /auth/me/` when a fresh profile is needed. `useUserData` must never call a user-detail endpoint.

**API base URL must be `/api/v1` (C3).** `.env` values must be `http://localhost:8000/api/v1` (dev) and `https://django-resolver.onrender.com/api/v1` (prod). Using `/api` as the base causes all CRUD calls to 404.

**Sidebar must not return null for null role (C5).** `AppSidebar` must use `effectiveRole = role ?? 'user'` so pure requesters (no `RoleAssignment`, `role: null`) get the 'user' sidebar config. Returning `null` or an empty sidebar for null-role users leaves them with no navigation.

**Null-role login redirect is `/user`, not `/dashboard` (C6).** `LoginForm` / `AuthWrapper` redirect logic: `(result.role && roleRedirect[result.role]) ?? '/user'`. The fallback `/dashboard` requires admin and serves an "Access Denied" screen to pure requesters.

**Never access ORM properties on user objects inside async Channels consumers (C7).** Properties like `user.role` trigger a synchronous ORM query and raise `SynchronousOnlyOperation` in an async consumer. Always read role/scope from `self.scope` (set by the JWT middleware at handshake time).

**`useUserDashboard` must not be a stub — it calls `GET /analytics/overview/` (C8).** Returning `{data: null, loading: false}` without an API call leaves every stat card at 0. The endpoint uses `IsAuthenticated` and scopes automatically to `raised_by=user` for null-role users. Response mapping: `summary.total` = sum of all `status_distribution` counts; `summary.open` = `open_backlog`; `summary.pending` = the pending entry's count; `status_distribution` passed through directly. Every role dashboard hook must call a real analytics endpoint.

**`flattenJWT` must read `campus_id` from the JWT token payload for null-role users (C9).** `ar?.campusId` is null when `activeRole` is null (pure requesters). The JWT access token always carries `campus_id` (set by `build_tokens_for_assignment` for every user including pure requesters). `flattenJWT` must decode the token and use `primary_campus_id: ar?.campusId ?? tokenCampusId ?? null`. Without this, `useCatalog(campusId)` receives null and the TicketCreationWizard never loads categories.

**Patch stale `primary_campus_id: null` from the JWT on session hydration (C10).** Users with existing sessions before the `flattenJWT` fix still have `primary_campus_id: null` in localStorage. `useUserData` (`src/hooks/users/useUserData.ts`) must patch `primary_campus_id` from the stored JWT token claims when the stored value is null, before calling `setUser()`. General rule: when a stored profile field is null but the corresponding JWT claim is non-null, patch from the token — do not wait for the user to log out.

**Section column must read `section.section_type_name`, not `section.name` (C11).** `_SectionMinSerializer` returns `{id, section_type_id, section_type_name}`. There is no top-level `name` field — the Section model has none. Reading `s?.name` is always `undefined` and leaves the column blank. Use `s?.section_type_name` (with `s?.name` as a backward-compat fallback). Do not add a `name` field to `_SectionMinSerializer` on the backend.

**`_overview_slice` must include `status_distribution` (C12).** Every role's `GET /analytics/overview/` response is built by `_overview_slice`. If `status_distribution` is omitted from the slice, the frontend total computation (`dist.reduce(sum)`) returns 0 and all stat cards show 0. The fix is server-side: `"status_distribution": data.get("status_distribution", [])` in `_overview_slice` (`apps/analytics/views.py`).

**Dashboard hooks must not produce 0 from a missing optional field (C13).** `useUserDashboard` computes `total` from `status_distribution`. If the array is absent, `total = 0` permanently. Use `open_backlog + resolved` as a fallback: `total = distTotal > 0 ? distTotal : openBacklog + resolvedCount`. Every dashboard hook that derives a count from an optional array must have a reliable numeric fallback.

**Both database branches in `settings.py` must have `CONN_MAX_AGE` (C14).** The `DATABASE_URL` branch sets it via `dj_database_url.config(conn_max_age=600)`. The direct-env-var branch (local dev) must also set `CONN_MAX_AGE: 300` and `CONN_HEALTH_CHECKS: True`. Without it, NeonDB cold-start latency (~13–19 s) causes Daphne to cancel requests, which appears as `data=null` stat cards in the UI — not an application bug but a connection-pool misconfiguration.

**A reference-data query param that's accepted but never filters is worse than none (C15).** `/departments/?campus=` and `/sections/?department=` looked correct — the frontend sent them, the URL showed them — but `DepartmentViewSet`/`SectionViewSet` had no `get_queryset()` override, so every Campus→Department→Section cascading select (Users admin page, Technician form) silently showed every row regardless of scope. Before trusting a scoping query param on a reference-data endpoint, check the viewset's `get_queryset()` actually applies it — don't assume from the param existing in the URL.

**Replacing a primary `RoleAssignment` demotes the old one; it does not delete it (C16).** Posting a new `is_primary=True` role assignment for a user (the Users admin page's promote/demote flow) must not error on `one_primary_role_per_user`, and must not delete the previous primary — it demotes it (`is_primary: false`) inside the same transaction, keeping it for audit history. If you see this constraint error surfaced to the UI, the fix is server-side (`UserRoleAssignmentListCreateView`), not a frontend retry/catch.

**`ServiceItem` priority override defaults to "inherit," not to the first priority in the list.** `ItemForm`'s priority `Select` must default to an empty/`__inherit__` sentinel, not `priorities[0]` (unlike `CategoryForm`, where a priority is required). Sending `default_priority_id: null` clears an existing override back to inheritance — omitting the field on update does not.

---

## 28. Reconciliation & Removal (aligns to backend plan §6)

Apply after backend parity exists; remove only once the replacement path works.

| File / area | Action | Reason (plan rule) |
|-------------|--------|--------------------|
| `features/admin/WorkflowsPage.tsx` + Workflows nav entry | **Remove** | No per-campus workflow; the ladder (technician→HOS→HOD) is structural (R6/R7/R10) |
| `features/admin/ContextConfigEditor.tsx` | **Remove / repurpose** | "Context/workflow config" is not part of the model |
| `components/shared/ticket/ApproveRejectActions.tsx` + manager approve/reject | **Remove** | No approval transition in the lifecycle — removed entirely (§2.4) |
| `TicketCreationWizard.tsx` + `utils/ticketValidation.ts` | **Align** | Send `service_item` (+location) only; drop priority/section inputs (R6/R7) |
| `useServiceCategories` / `useServiceItems` in the create flow → `useCatalog(campusId)` | **Align** | Campus-filtered catalogue tree (R5) |
| `FacilityLocationSelector` + per-type forms + any free-text building inputs | **Align** | One hardcoded form per fixed facility type; building dropdown from `Facility` registry; remove free text. No `field_schema`/`DynamicFormRenderer` (R13/R14) |
| `types/ticket.types.ts` status values | **Align** | Canonical set `open/assigned/in_progress/pending/resolved/closed`; drop `pending_approval`/`approved`/`rejected`/`escalated` |
| `SLACountdown.tsx` | **Align** | Paused state on hold; no client SLA math (R9) |
| `TechnicianPicker` / `AssignmentModal` | **Align** | Scope to the ticket's section pool |
| `RatingModal` / `RatingWidget` | **Align** | Once, resolved+, requester only (R11) |
| `TicketTimeline` / `CommentThread` | **Align** | Merge log+comment+feedback; hide internal from requester (R11) |
| `SLAComplianceGauge` / `TicketVolumeChart` / `TechnicianPerformanceTable` / `SLATrackingView` | **Align** | Bind to `/analytics/*`; remove client aggregation (Phase 7) |
| `features/admin/Sections/SectionForm` + `SectionsPage` | **Align** | Section = campus instance under (campus_department, section_type); not a global picklist (R3) |
| `features/admin/Catalogue` category form + `types/catalogue.ts` | **Align / remove dept field** | Category has no department FK; derive via section type (R4) |
| `EscalationModal.tsx` | **Align** | `current_level` server-owned; never client-computed (R7/R10) |
| `types/ticket.types.ts` `current_level`, `priority` object, due dates, `paused_at`, `location` | **Add/align** | New/clarified fields (R7/R9/R13) |
| `features/admin/SLARulesPage.tsx` | **Align** | Model as Priority + ordered EscalationRule rungs, not flat per-ticket numbers |

**Naming:** the human ticket id is **`ticket_no`** everywhere (frontend and backend serializer). The raiser FK is **`raised_by`** (not `requester`). There is no `reference` field.
