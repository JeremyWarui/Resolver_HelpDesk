import type { UserRole } from '@/types';
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  AlertCircle,
  PauseCircle,
  Zap,
  Inbox,
  Wrench,
} from 'lucide-react';

type BadgeColor = 'amber' | 'blue' | 'green' | 'red' | 'purple' | 'gray';

export interface StatDefinition<DataType = unknown> {
  id: string;
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBgColor: string;
  iconColor?: string;
  calculate: (data: DataType) => {
    value: number | string;
    badge?: { value: string; color: BadgeColor };
    description?: string;
  };
}

/**
 * A StatDefinition with its data type erased for storage in the mixed
 * STAT_VIEWS / STAT_DEFINITIONS registries below. Each registry holds
 * definitions over heterogeneous data shapes (OverviewResponse, AdminSystemData,
 * TechnicianCountsData, …). Because `calculate`'s parameter is contravariant, no
 * single concrete — nor `unknown`/`never` — supertype accepts them all, so `any`
 * is genuinely required here. The consumer `StatCardsRenderer<T>` re-narrows the
 * data type via its own generic at each call site, so type safety is preserved
 * where it matters. (typescript-eslint `no-explicit-any` documents this exact
 * escape hatch for code "that can't yet be represented in the TypeScript type system".)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyStatDefinition = StatDefinition<any>;

// ============================================
// SHARED FACTORY — STATUS OVERVIEW (canonical 5-card dashboard row)
// Total / Open / Assigned / Resolved / Pending, computed from the role-scoped
// live status distribution. Reused by Manager, HOD, and HOS so every dashboard
// shows the SAME overview cards — only the scope label (totalDescription) differs.
// ============================================

interface StatusOverviewData {
  /** Live counts across ALL scoped tickets — preferred source for cards */
  live_status_distribution?: Array<{ status: string; count: number }>;
  /** Windowed counts (created_at in range) — fallback */
  status_distribution?: Array<{ status: string; count: number }>;
}

/** Sum counts for one or more statuses from a status distribution array. */
function liveCount(
  dist: Array<{ status: string; count: number }> | undefined,
  ...statuses: string[]
): number {
  return (dist ?? [])
    .filter((s) => statuses.includes(s.status))
    .reduce((sum, s) => sum + s.count, 0);
}

const overviewDist = (d: StatusOverviewData) =>
  d.live_status_distribution ?? d.status_distribution ?? [];

const ALL_STATUSES = ['open', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'];

/**
 * Build the canonical Total/Open/Assigned/Resolved/Pending overview cards,
 * scope-labelled. `idPrefix` keeps card ids unique per role; `totalDescription`
 * is the only copy that varies by scope (e.g. "All tickets in your department").
 * Data is role-scoped server-side, so the same definitions yield admin-wide,
 * department-, or section-scoped numbers depending on whose overview is passed.
 */
function statusOverviewStats(
  idPrefix: string,
  totalDescription: string
): StatDefinition<StatusOverviewData>[] {
  return [
    {
      id: `${idPrefix}-total`,
      title: 'Total Tickets',
      icon: FileText,
      iconBgColor: 'bg-primary/10',
      iconColor: 'text-primary',
      calculate: (data) => ({
        value: liveCount(overviewDist(data), ...ALL_STATUSES),
        description: totalDescription,
        badge: { value: 'All', color: 'blue' },
      }),
    },
    {
      id: `${idPrefix}-open`,
      title: 'Open Tickets',
      icon: AlertTriangle,
      iconBgColor: 'bg-status-open/10',
      iconColor: 'text-status-open',
      calculate: (data) => {
        const count = liveCount(overviewDist(data), 'open');
        return {
          value: count,
          description: 'Awaiting assignment',
          badge: { value: count > 0 ? 'Active' : 'Clear', color: count > 0 ? 'blue' : 'green' },
        };
      },
    },
    {
      id: `${idPrefix}-assigned`,
      title: 'Assigned',
      icon: Inbox,
      iconBgColor: 'bg-status-progress/10',
      iconColor: 'text-status-progress',
      calculate: (data) => {
        const count = liveCount(overviewDist(data), 'assigned');
        return {
          value: count,
          description: 'Assigned to a technician',
          badge: { value: count > 0 ? 'Active' : 'None', color: count > 0 ? 'blue' : 'gray' },
        };
      },
    },
    {
      id: `${idPrefix}-resolved`,
      title: 'Resolved',
      icon: CheckCircle,
      iconBgColor: 'bg-status-resolved/10',
      iconColor: 'text-status-resolved',
      calculate: (data) => {
        const count = liveCount(overviewDist(data), 'resolved', 'closed');
        return {
          value: count,
          description: count > 0 ? 'Completed' : 'None yet',
          badge: { value: count > 0 ? 'Done' : 'None yet', color: count > 0 ? 'green' : 'gray' },
        };
      },
    },
    {
      id: `${idPrefix}-pending`,
      title: 'Pending',
      icon: PauseCircle,
      iconBgColor: 'bg-status-pending/10',
      iconColor: 'text-status-pending',
      calculate: (data) => {
        const count = liveCount(overviewDist(data), 'pending');
        return {
          value: count,
          description: 'Awaiting more information',
          badge: { value: count > 0 ? `${count} pending` : 'None', color: 'gray' },
        };
      },
    },
  ];
}

// ============================================
// SHARED STATS — SECTION OVERVIEW
// Used by: Technician (section view) + Section Head (section view)
// ============================================

interface SectionOverviewData {
  section?: {
    name: string;
    total_tickets: number;
    open: number;
    in_progress: number;
    pending: number;
    resolved: number;
    avg_resolution_time: number;
  };
  overdue_count?: number;
}

export const SECTION_OVERVIEW_STATS: StatDefinition<SectionOverviewData>[] = [
  {
    id: 'section-total',
    title: 'Section Tickets',
    icon: FileText,
    iconBgColor: 'bg-primary/10',
    iconColor: 'text-primary',
    calculate: (data) => ({
      value: data.section?.total_tickets ?? 0,
      description: 'All tickets in this section',
      badge: {
        value: 'Total',
        color: 'blue',
      },
    }),
  },
  {
    id: 'section-open',
    title: 'Open & Unassigned',
    icon: Inbox,
    iconBgColor: 'bg-status-open/10',
    iconColor: 'text-status-open',
    calculate: (data) => {
      const count = data.section?.open ?? 0;
      return {
        value: count,
        description: 'Waiting for assignment',
        badge: {
          value: count > 0 ? 'Action needed' : 'Clear',
          color: count > 0 ? 'blue' : 'green',
        },
      };
    },
  },
  {
    id: 'section-in-progress',
    title: 'In Progress',
    icon: Zap,
    iconBgColor: 'bg-status-progress/10',
    iconColor: 'text-status-progress',
    calculate: (data) => ({
      value: data.section?.in_progress ?? 0,
      description: 'Currently being worked on',
      badge: {
        value: data.section?.avg_resolution_time
          ? `${(data.section.avg_resolution_time / 60).toFixed(1)}h avg`
          : 'Active',
        color: 'amber',
      },
    }),
  },
  {
    id: 'section-resolved',
    title: 'Resolved',
    icon: CheckCircle,
    iconBgColor: 'bg-status-resolved/10',
    iconColor: 'text-status-resolved',
    calculate: (data) => ({
      value: data.section?.resolved ?? 0,
      description: 'Successfully completed',
      badge: { value: 'Done', color: 'green' },
    }),
  },
  {
    id: 'section-overdue',
    title: 'Overdue',
    icon: AlertCircle,
    iconBgColor: 'bg-status-escalated/10',
    iconColor: 'text-status-escalated',
    calculate: (data) => {
      const count = data.overdue_count ?? 0;
      return {
        value: count,
        description: count > 0 ? 'Attention needed' : 'On track',
        badge: {
          value: count > 0 ? `${count} overdue` : 'On track',
          color: count > 0 ? 'red' : 'green',
        },
      };
    },
  },
];

// ============================================
// TECHNICIAN STATS — PERSONAL (My Assigned)
// Used by: Technician (on assigned tickets page)
// ============================================

export interface TechnicianCountsData {
  counts?: {
    all?: number;
    assigned?: number;
    in_progress?: number;
    pending?: number;
    resolved?: number;
  };
}

// Card ids match the technician ticket-queue filter keys so clicking a card
// can drive the active filter (see TechTickets onCardClick).
export const TECHNICIAN_PERSONAL_STATS: StatDefinition<TechnicianCountsData>[] = [
  {
    id: 'assigned',
    title: 'New Work',
    icon: Inbox,
    iconBgColor: 'bg-primary/10',
    iconColor: 'text-primary',
    calculate: (data) => ({
      value: data.counts?.assigned ?? 0,
      description: 'Ready to start',
    }),
  },
  {
    id: 'in_progress',
    title: 'Active Jobs',
    icon: Wrench,
    iconBgColor: 'bg-status-progress/10',
    iconColor: 'text-status-progress',
    calculate: (data) => ({
      value: data.counts?.in_progress ?? 0,
      description: 'Working on it',
    }),
  },
  {
    id: 'pending',
    title: 'On Hold',
    icon: PauseCircle,
    iconBgColor: 'bg-status-pending/10',
    iconColor: 'text-status-pending',
    calculate: (data) => ({
      value: data.counts?.pending ?? 0,
      description: 'Need parts/help',
    }),
  },
  {
    id: 'resolved',
    title: 'Finished',
    icon: CheckCircle,
    iconBgColor: 'bg-status-resolved/10',
    iconColor: 'text-status-resolved',
    calculate: (data) => ({
      value: data.counts?.resolved ?? 0,
      description: 'Work done',
    }),
  },
];

// ============================================
// SECTION HEAD STATS — PERSONAL DASHBOARD
// Used by: Section Head (main dashboard view)
// ============================================

// Section-scoped overview (server scopes the data to the HOS's section(s)).
export const SECTION_HEAD_PERSONAL_STATS = statusOverviewStats(
  'hos',
  'All tickets in your section'
);

// ============================================
// HOD STATS — DEPARTMENT DASHBOARD (One Branch)
// Used by: HOD (Head of Department - manages one dept in one branch)
// Scope: All sections + tickets in their department within their branch
// ============================================

// Department-scoped overview (server scopes the data to the HOD's department).
export const HOD_DEPARTMENT_STATS = statusOverviewStats(
  'hod',
  'All tickets in your department'
);

// ============================================
// MANAGER STATS — ORGANIZATION DASHBOARD
// Used by: Manager (manages one department across all branches/organization)
// Scope: Their department across all branches + branch breakdown
// ============================================

// Department-across-all-campuses overview (server scopes to the manager's dept).
export const MANAGER_ORGANIZATION_STATS = statusOverviewStats(
  'mgr',
  'All department tickets'
);

// ============================================
// ADMIN STATS — SYSTEM OVERVIEW
// Used by: Admin (dashboard + OrganisationAnalytics)
// Reads from OverviewResponse.live_status_distribution (ALL scoped tickets by
// current status, not date-windowed) so cards always reflect live system state.
// ============================================

interface AdminSystemData {
  live_status_distribution?: Array<{ status: string; count: number }>;
  resolution_sla_pct?: number | null;
  created?: number;
  breached?: number;
}

export const ADMIN_SYSTEM_STATS: StatDefinition<AdminSystemData>[] = [
  {
    id: 'admin-total',
    title: 'Total Tickets',
    icon: FileText,
    iconBgColor: 'bg-primary/10',
    iconColor: 'text-primary',
    calculate: (data) => {
      const total = (data.live_status_distribution ?? []).reduce(
        (sum, s) => sum + s.count,
        0
      );
      return {
        value: total,
        description: 'All tickets in system',
        badge: {
          value: `${data.created ?? 0} this period`,
          color: 'blue',
        },
      };
    },
  },
  {
    id: 'admin-open',
    title: 'Open Tickets',
    icon: AlertTriangle,
    iconBgColor: 'bg-status-open/10',
    iconColor: 'text-status-open',
    calculate: (data) => {
      const count = liveCount(data.live_status_distribution, 'open');
      return {
        value: count,
        description: 'Awaiting assignment',
        badge: {
          value: count > 0 ? 'Active' : 'Clear',
          color: count > 0 ? 'blue' : 'green',
        },
      };
    },
  },
  {
    id: 'admin-resolved',
    title: 'Resolved Tickets',
    icon: CheckCircle,
    iconBgColor: 'bg-status-resolved/10',
    iconColor: 'text-status-resolved',
    calculate: (data) => {
      const count = liveCount(data.live_status_distribution, 'resolved', 'closed');
      const sla = data.resolution_sla_pct ?? null;
      return {
        value: count,
        description: sla != null ? `${sla.toFixed(0)}% met SLA` : 'Successfully completed',
        badge: {
          value: sla != null ? `${sla.toFixed(0)}% SLA` : 'Done',
          color: sla != null && sla >= 90 ? 'green' : sla != null ? 'amber' : 'green',
        },
      };
    },
  },
  {
    id: 'admin-in-progress',
    title: 'In Progress',
    icon: Clock,
    iconBgColor: 'bg-status-progress/10',
    iconColor: 'text-status-progress',
    calculate: (data) => {
      const count = liveCount(
        data.live_status_distribution,
        'assigned',
        'in_progress',
        'pending'
      );
      return {
        value: count,
        description: 'Assigned, active, or on hold',
        badge: {
          value: count > 0 ? 'Active' : 'Clear',
          color: 'amber',
        },
      };
    },
  },
  {
    id: 'admin-overdue',
    title: 'SLA Breached',
    icon: AlertCircle,
    iconBgColor: 'bg-status-escalated/10',
    iconColor: 'text-status-escalated',
    calculate: (data) => {
      const count = data.breached ?? 0;
      return {
        value: count,
        description: count > 0 ? 'Past resolution deadline' : 'All within SLA',
        badge: {
          value: count > 0 ? `${count} breached` : 'On track',
          color: count > 0 ? 'red' : 'green',
        },
      };
    },
  },
];

// ============================================
// USER STATS — PERSONAL DASHBOARD
// Used by: User (my tickets view)
// Reads live_status_distribution (all user's tickets by current status) so cards
// reflect actual state regardless of the 30-day creation window.
// Falls back to summary / status_distribution if live data is unavailable.
// ============================================

interface UserPersonalData {
  /** Live counts across ALL user's tickets — preferred source for stat cards */
  live_status_distribution?: Array<{ status: string; count: number }>;
  summary?: {
    total: number;
    open: number;    // open_backlog (active tickets count)
    pending: number;
  };
  /** Windowed counts (created_at in window) — fallback / used for charts */
  status_distribution?: Array<{ status: string; count: number }>;
}

export const USER_PERSONAL_STATS: StatDefinition<UserPersonalData>[] = [
  {
    id: 'user-total',
    title: 'My Tickets',
    icon: FileText,
    iconBgColor: 'bg-primary/10',
    iconColor: 'text-primary',
    calculate: (data) => {
      const liveTotal = (data.live_status_distribution ?? []).reduce(
        (sum, s) => sum + s.count,
        0
      );
      return {
        value: liveTotal || (data.summary?.total ?? 0),
        description: 'All tickets raised by you',
        badge: { value: 'Total', color: 'blue' },
      };
    },
  },
  {
    id: 'user-open',
    title: 'Open',
    icon: AlertTriangle,
    iconBgColor: 'bg-status-open/10',
    iconColor: 'text-status-open',
    calculate: (data) => {
      // live 'open' = unassigned; fallback to open_backlog from summary
      const count =
        liveCount(data.live_status_distribution, 'open') ||
        (data.summary?.open ?? 0);
      return {
        value: count,
        description: 'Awaiting assignment',
        badge:
          count > 0
            ? { value: 'Open', color: 'blue' }
            : { value: 'None', color: 'gray' },
      };
    },
  },
  {
    id: 'user-in-progress',
    title: 'In Progress',
    icon: Clock,
    iconBgColor: 'bg-status-progress/10',
    iconColor: 'text-status-progress',
    calculate: (data) => {
      const count =
        liveCount(data.live_status_distribution, 'assigned', 'in_progress') ||
        (data.status_distribution?.find((s) => s.status === 'in_progress')?.count ?? 0);
      return {
        value: count,
        description: 'Being worked on',
        badge:
          count > 0
            ? { value: 'Active', color: 'amber' }
            : { value: 'None', color: 'gray' },
      };
    },
  },
  {
    id: 'user-pending',
    title: 'On Hold',
    icon: PauseCircle,
    iconBgColor: 'bg-status-pending/10',
    iconColor: 'text-status-pending',
    calculate: (data) => {
      const count =
        liveCount(data.live_status_distribution, 'pending') ||
        (data.summary?.pending ?? 0);
      return {
        value: count,
        description: 'Awaiting more information',
        badge:
          count > 0
            ? { value: 'Pending', color: 'amber' }
            : { value: 'None', color: 'gray' },
      };
    },
  },
  {
    id: 'user-resolved',
    title: 'Resolved',
    icon: CheckCircle,
    iconBgColor: 'bg-status-resolved/10',
    iconColor: 'text-status-resolved',
    calculate: (data) => {
      const count =
        liveCount(data.live_status_distribution, 'resolved', 'closed') ||
        (data.status_distribution
          ?.filter((s) => s.status === 'resolved' || s.status === 'closed')
          .reduce((sum, s) => sum + s.count, 0) ?? 0);
      return {
        value: count,
        description: 'Successfully closed',
        badge: {
          value: count > 0 ? 'Done' : 'None yet',
          color: count > 0 ? 'green' : 'gray',
        },
      };
    },
  },
];

// ============================================
// VIEW-BASED EXPORT (The key!)
// A single view can be used by multiple roles
// ============================================

export type StatCardView =
  | 'section_overview' // Technician + Section Head (viewing section stats)
  | 'technician_personal' // Technician (viewing assigned to me)
  | 'section_head_personal' // Section Head (personal dashboard)
  | 'hod_department' // HOD (one department in one branch)
  | 'manager_organization' // Manager (one department across organization)
  | 'admin_system' // Admin (system overview)
  | 'user_personal'; // User (personal dashboard)

export const STAT_VIEWS: Record<StatCardView, AnyStatDefinition[]> = {
  section_overview: SECTION_OVERVIEW_STATS,
  technician_personal: TECHNICIAN_PERSONAL_STATS,
  section_head_personal: SECTION_HEAD_PERSONAL_STATS,
  hod_department: HOD_DEPARTMENT_STATS,
  manager_organization: MANAGER_ORGANIZATION_STATS,
  admin_system: ADMIN_SYSTEM_STATS,
  user_personal: USER_PERSONAL_STATS,
};

/**
 * Backward compatibility: role-based access
 * For roles that have a single primary view
 */
export const STAT_DEFINITIONS: Record<UserRole, AnyStatDefinition[]> = {
  admin: ADMIN_SYSTEM_STATS,
  user: USER_PERSONAL_STATS,
  technician: TECHNICIAN_PERSONAL_STATS,
  hos: SECTION_HEAD_PERSONAL_STATS,
  hod: HOD_DEPARTMENT_STATS,
  manager: MANAGER_ORGANIZATION_STATS,
};
