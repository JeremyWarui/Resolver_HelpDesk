// Everything the frontend knows about a role: what it is called, how it sorts,
// what it covers, and where it lives.

import type { UserRole } from '@/types';

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User',
  technician: 'Technician',
  hos: 'Head of Section',
  hod: 'Head of Department',
  manager: 'Manager',
  admin: 'Admin',
};

export const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  user: 'bg-gray-100 text-gray-600',
  technician: 'bg-blue-100 text-blue-700',
  hos: 'bg-purple-100 text-purple-700',
  hod: 'bg-orange-100 text-orange-700',
  manager: 'bg-teal-100 text-teal-700',
  admin: 'bg-red-100 text-red-700',
};

export const ROLE_ORDER: UserRole[] = ['admin', 'manager', 'hod', 'hos', 'technician', 'user'];

/**
 * Where each role lives. The sidebar builds its links from this and the login
 * redirect reads it, so a renamed prefix moves both together. App.tsx spells
 * its own paths out; change those by hand.
 */
export const ROLE_BASE: Record<UserRole, string> = {
  user: '/user',
  technician: '/tech',
  hos: '/hos',
  hod: '/hod',
  manager: '/director',
  admin: '/dashboard',
};

/**
 * What a role's figures cover. Every scoped page carries this under its title,
 * and all of them read the same server-side scope.
 */
export const SCOPE_SUBTITLE: Partial<Record<UserRole, string>> = {
  admin: 'Every campus',
  manager: 'Every campus',
  hod: 'Your campus',
  hos: 'Your campus',
  // Only the Reports page shows it: a technician's figures cover their own jobs.
  technician: 'Jobs assigned to you',
};

/** Who a ticket has climbed to. Keys are `Ticket.current_level`.
 *
 *  Two forms because a badge and a sentence need different lengths: `short`
 *  shares a table cell with the status pill, `full` completes "Escalated to …".
 *  The title-case name is `ROLE_LABELS`, so there is no third spelling. */
export const ESCALATION_LEVEL: Record<string, { short: string; full: string }> = {
  technician: { short: 'Tech', full: 'the technician' },
  hos:        { short: 'HOS',  full: 'the head of section' },
  hod:        { short: 'HOD',  full: 'the head of department' },
};

/** The roles whose scope is one campus. Mirrors `CAMPUS_ROLES` in
 *  `backend/apps/accounts/models.py`, which refuses a campus on any other role
 *  and refuses an assignment without one on these. */
export const ROLES_REQUIRING_CAMPUS: UserRole[] = ['technician', 'hos', 'hod'];

/** Whether the scheduled escalation check is alive (`schedule_state` from the
 *  server). `alert` is every state but running. */
export const ESCALATION_SCHEDULE: Record<'never' | 'failing' | 'stale' | 'running', { label: string; alert: boolean }> = {
  never:   { label: 'Not scheduled', alert: true },
  failing: { label: 'Failing',       alert: true },
  stale:   { label: 'Stopped',       alert: true },
  running: { label: 'Running',       alert: false },
};

/** The roles whose reports cover every campus: they read the campus sections
 *  and may narrow to one campus. Mirrors `EVERY_CAMPUS_ROLES` in
 *  `backend/apps/analytics/overview.py`; an HOS or HOD reads their
 *  technicians instead. */
export const EVERY_CAMPUS_ROLES: UserRole[] = ['admin', 'manager'];

/** Roles that run the system from a desk. Their pages open on a phone, but are
 *  laid out for a computer; requesters and technicians are the ones out and about. */
export const DESK_ROLES: UserRole[] = ['admin', 'manager', 'hod', 'hos'];

/** What the role-and-scope control edits: the role, the campus it covers, and
 *  (technicians only) the trades. The shape `accounts.posts.assign_role` takes. */
export interface RoleScopeValue {
  role: UserRole;
  campus_id: string;
  /** Technician only, and at least one — a technician with no trade sees no
   *  tickets, which the server refuses rather than creating silently. */
  trade_ids: number[];
}
