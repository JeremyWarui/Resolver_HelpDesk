// lib/auth/permissions.ts — role → permission map
// Guards UI elements; the API is the authoritative permission layer.

import type { UserRole } from '@/types';
import type { PermissionMap } from '@/types';

export const ROLE_PERMISSIONS: Record<UserRole, PermissionMap> = {
  user: {
    canCreateTicket: true,
    canAssignTicket: false,
    canReassignTicket: false,
    canUpdateTicketStatus: false,
    canEscalate: false,
    canCloseTicket: true,    // user confirms resolution
    canReopenTicket: true,   // user reopens resolved ticket
    canRateTicket: true,

    canViewDeptQueue: false,
    canViewOrgAnalytics: false,
    canViewSLATracking: false,
    canExportReports: false,
    canConfigureSystem: false,
    canManageUsers: false,
  },

  technician: {
    canCreateTicket: true,
    canAssignTicket: false,
    canReassignTicket: false,
    canUpdateTicketStatus: true,   // own assigned tickets
    canEscalate: true,
    canCloseTicket: false,
    canReopenTicket: false,
    canRateTicket: false,

    canViewDeptQueue: false,
    canViewOrgAnalytics: false,
    canViewSLATracking: false,
    canExportReports: false,
    canConfigureSystem: false,
    canManageUsers: false,
  },

  hos: {
    canCreateTicket: true,
    canAssignTicket: true,
    canReassignTicket: true,
    canUpdateTicketStatus: true,
    canEscalate: true,
    canCloseTicket: false,
    canReopenTicket: false,
    canRateTicket: false,

    canViewDeptQueue: false,
    canViewOrgAnalytics: false,
    canViewSLATracking: true,
    canExportReports: true,
    canConfigureSystem: false,
    canManageUsers: false,
  },

  hod: {
    canCreateTicket: true,
    canAssignTicket: true,
    canReassignTicket: true,
    canUpdateTicketStatus: true,
    canEscalate: true,
    canCloseTicket: false,
    canReopenTicket: false,
    canRateTicket: false,

    canViewDeptQueue: true,
    canViewOrgAnalytics: false,
    canViewSLATracking: true,
    canExportReports: true,
    canConfigureSystem: false,
    canManageUsers: false,
  },

  manager: {
    canCreateTicket: false,
    canAssignTicket: false,
    canReassignTicket: false,
    canUpdateTicketStatus: false,
    canEscalate: false,
    canCloseTicket: false,
    canReopenTicket: false,
    canRateTicket: false,

    canViewDeptQueue: true,
    canViewOrgAnalytics: true,
    canViewSLATracking: true,
    canExportReports: true,
    canConfigureSystem: false,
    canManageUsers: false,
  },

  admin: {
    canCreateTicket: true,
    canAssignTicket: true,
    canReassignTicket: true,
    canUpdateTicketStatus: true,
    canEscalate: true,
    canCloseTicket: true,
    canReopenTicket: true,
    canRateTicket: false,

    canViewDeptQueue: true,
    canViewOrgAnalytics: true,
    canViewSLATracking: true,
    canExportReports: true,
    canConfigureSystem: true,
    canManageUsers: true,
  },
};

export function getPermissions(role: UserRole): PermissionMap {
  return ROLE_PERMISSIONS[role];
}
