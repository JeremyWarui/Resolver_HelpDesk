// Shared types from Phase 2.4 — additive to existing types
// These do NOT replace existing types (UserRole, Ticket, etc.) — they extend the type system
// for the new shared component layer (FilterPills, TicketTable variants, permissions, etc.)

import type { UserRole } from './user.types';

// ─── Role aliases ─────────────────────────────────────────────────────────────
// The plan uses `Role`; the codebase uses `UserRole`. Both are valid.
export type Role = UserRole;

// ─── Permission map ───────────────────────────────────────────────────────────

export interface PermissionMap {
  canCreateTicket: boolean;
  canAssignTicket: boolean;
  canReassignTicket: boolean;
  canUpdateTicketStatus: boolean;
  canEscalate: boolean;
  canCloseTicket: boolean;
  canReopenTicket: boolean;
  canRateTicket: boolean;
  canViewDeptQueue: boolean;
  canViewOrgAnalytics: boolean;
  canViewSLATracking: boolean;
  canExportReports: boolean;
  canConfigureSystem: boolean;
  canManageUsers: boolean;
}

// ─── Ticket table variants ────────────────────────────────────────────────────

export type TicketTableVariant =
  | 'queue'       // HOS/HOD/Technician — full columns, bulk actions, filter bar
  | 'compact'     // Dashboard preview widgets — fewer columns, no bulk
  | 'sla'         // SLA tracking — replaces date cols with countdown bar
  | 'admin'       // Admin view — all columns including internal fields
  | 'my-tickets'; // User's own ticket history — mid-density

// ─── Filter pills ─────────────────────────────────────────────────────────────

export interface FilterPill {
  key: string;
  label: string;
  count?: number;
  variant?: 'default' | 'danger' | 'warning' | 'success'
           | 'open' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'closed';
}

// Shared filter state — designed for URL search param sync via useTicketFilters
export interface TicketFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  overdue?: boolean;
  page?: number;     // DRF PageNumberPagination — /tickets/ is ordered -updated_at,
  pageSize?: number; // a mutable sort key that rules out cursor pagination by design.
}

// Counts returned alongside ticket list — all counts always reflect full unfiltered scope
export interface TicketListCounts {
  all: number;
  open: number;
  assigned: number;
  in_progress: number;
  pending: number;
  resolved: number;
  closed: number;
  [key: string]: number;
}

// ─── Paginated response shapes ────────────────────────────────────────────────

// Current DRF offset pagination shape
export interface DRFPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Future cursor pagination shape (matches backend plan Phase B)
export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    prevCursor: string | null;
    total: number;
  };
  counts?: TicketListCounts;
}

// ─── Ticket priority ──────────────────────────────────────────────────────────
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

// ─── Paginated response alias (plan name for DRFPaginatedResponse) ─────────────
export type PaginatedResponse<T> = DRFPaginatedResponse<T>;

// ─── Technician summary (used by TechnicianPicker and workload views) ─────────
export interface TechnicianSummary {
  id: number;
  username: string;
  name: string;
  activeTicketCount: number;
  slaComplianceRate: number;
}

// ─── Generic KPI metrics ──────────────────────────────────────────────────────
export interface KPIMetrics {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  avgResolutionHours: number;
  slaComplianceRate: number;
  escalationCount: number;
  satisfactionScore: number | null;
  periodStart: string;
  periodEnd: string;
}

// ─── Notification types ───────────────────────────────────────────────────────

export type NotificationEventType =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_status_changed'
  | 'comment_added'
  | 'ticket_resolved'
  | 'ticket_escalated'
  | 'sla_warning'
  | 'sla_breach';

export interface AppNotification {
  id: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  ticketId: string | null;
  read: boolean;
  createdAt: string;
}

// ─── Bulk actions (for TicketTable queue/admin variants) ──────────────────────

export interface BulkAction {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'destructive';
  onExecute: (ticketIds: number[]) => void | Promise<void>;
}

// ─── API error shape ──────────────────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

// ─── Auth user (adapted for DRF token auth — no JWT fields) ──────────────────

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  campus_name: string | null;
  primary_campus_id: number | null;
  primary_campus_display: string | null;
  primary_department_id: number | null;
  primary_department_display: string | null;
  sections: number[];
}

// ─── Scope (derived from AuthUser for role-scoped queries) ────────────────────

export interface UserScope {
  userId: number;
  role: UserRole;
  campusId: number | null;
  departmentId: number | null;
  sectionIds: number[];
}
