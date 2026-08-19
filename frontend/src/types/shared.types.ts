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
  | 'my-tickets'  // User's own ticket history — mid-density
  | 'pending';    // Work on hold — why, for how long, and who to ask

// ─── Filter pills ─────────────────────────────────────────────────────────────

export interface FilterPill {
  key: string;
  label: string;
  count?: number;
  variant?: 'default' | 'danger' | 'warning' | 'success'
           | 'open' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'closed';
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
// ─── Ticket priority ──────────────────────────────────────────────────────────
// ─── Paginated response alias (plan name for DRFPaginatedResponse) ─────────────
// ─── Technician summary (used by TechnicianPicker and workload views) ─────────
// ─── Generic KPI metrics ──────────────────────────────────────────────────────
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

// ─── API error shape ──────────────────────────────────────────────────────────

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
  primary_department_id: number | null;
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
