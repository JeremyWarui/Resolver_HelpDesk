// What a role may do to a ticket it can already see. Guards the action buttons
// on the ticket detail; the API is the authoritative layer and refuses the same
// things.
//
// Actions only — which sections a role reaches is `ROLE_NAV`.

import { useAuthStore } from '@/stores/authStore';
import type { PermissionMap, UserRole } from '@/types';

/** Signed out, or a role the map does not know: refuse everything. */
const NONE: PermissionMap = {
  canAssignTicket: false,
  canReassignTicket: false,
  canUpdateTicketStatus: false,
  canCloseTicket: false,
  canReopenTicket: false,
};

const ROLE_PERMISSIONS: Record<UserRole, PermissionMap> = {
  user: {
    canAssignTicket: false,
    canReassignTicket: false,
    canUpdateTicketStatus: false,
    canCloseTicket: true,    // the requester confirms resolution
    canReopenTicket: true,   // and reopens if it was not fixed
  },

  technician: {
    canAssignTicket: false,
    canReassignTicket: false,
    canUpdateTicketStatus: true,   // their own assigned tickets
    canCloseTicket: false,
    canReopenTicket: false,
  },

  hos: {
    canAssignTicket: true,
    canReassignTicket: true,
    canUpdateTicketStatus: true,
    canCloseTicket: false,
    canReopenTicket: false,
  },

  hod: {
    canAssignTicket: true,
    canReassignTicket: true,
    canUpdateTicketStatus: true,
    canCloseTicket: false,
    canReopenTicket: false,
  },

  // Oversight is read-only (REVIEW.md §4).
  manager: NONE,

  admin: {
    canAssignTicket: true,
    canReassignTicket: true,
    canUpdateTicketStatus: true,
    canCloseTicket: true,
    canReopenTicket: true,
  },
};

/**
 * What the signed-in role may do.
 *
 * Reads the auth store directly. This was a React context with a provider
 * around the whole app, but the store hydrates synchronously and this is a
 * lookup in a static map — there was nothing to provide and nothing to
 * memoize, and every consumer of that context wanted only the role anyway.
 */
export function usePermissions(): PermissionMap {
  const role = useAuthStore((s) => s.user?.role);
  return (role && ROLE_PERMISSIONS[role]) ?? NONE;
}

/** The signed-in role, or null when signed out. */
export function useRole(): UserRole | null {
  return useAuthStore((s) => s.user?.role) ?? null;
}
