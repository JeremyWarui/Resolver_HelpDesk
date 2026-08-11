// Per-role navigation config consumed by the generic RoleDashboardLayout.
// Collapses the duplicated SECTION_FROM_PATH / headerTitle maps that used to
// live in each of HODLayout / HOSLayout / ManagerLayout.

import type { UserRole } from '@/types';

export interface RoleNavConfig {
  /** Fallback role when the auth store has none. */
  defaultRole: UserRole;
  /** URL sub-segment → logical section key. */
  sectionFromPath: Record<string, string>;
  /** Section key → header title. */
  headerTitle: Record<string, string>;
}

export const ROLE_NAV: Record<'hod' | 'hos' | 'manager' | 'technician', RoleNavConfig> = {
  technician: {
    defaultRole: 'technician',
    sectionFromPath: {
      '':         'dashboard',
      assigned:   'assignedTickets',
      feedback:   'feedback',
      reports:    'report',
      settings:   'settings',
    },
    headerTitle: {
      dashboard:      'Section Tickets',
      assignedTickets: 'Assigned Tickets',
      feedback:       'Feedback',
      report:         'Reports',
      settings:       'Settings',
    },
  },
  hod: {
    defaultRole: 'hod',
    sectionFromPath: {
      '': 'dashboard',
      tickets: 'tickets',
      pending: 'pending',
      escalated: 'escalated',
      technicians: 'technicians',
      sections: 'sections',
      analytics: 'analytics',
      reports: 'reports',
      feedback: 'feedback',
      sla: 'sla',
      settings: 'settings',
    },
    headerTitle: {
      dashboard: 'Dashboard',
      tickets: 'Tickets',
      pending: 'Pending Work',
      escalated: 'Escalated',
      technicians: 'Technicians',
      sections: 'Trades',
      analytics: 'Analytics',
      reports: 'Reports',
      feedback: 'Feedback',
      sla: 'SLA Tracking',
      settings: 'Settings',
    },
  },
  hos: {
    defaultRole: 'hos',
    sectionFromPath: {
      '': 'dashboard',
      tickets: 'tickets',
      pending: 'pending',
      escalated: 'escalated',
      technicians: 'technicians',
      analytics: 'analytics',
      reports: 'reports',
      feedback: 'feedback',
      sla: 'sla',
      settings: 'settings',
    },
    headerTitle: {
      dashboard: 'Dashboard',
      tickets: 'Tickets',
      pending: 'Pending Work',
      escalated: 'Escalated',
      technicians: 'Technicians',
      analytics: 'Analytics',
      reports: 'Reports',
      feedback: 'Feedback',
      sla: 'SLA Tracking',
      settings: 'Settings',
    },
  },
  manager: {
    defaultRole: 'manager',
    sectionFromPath: {
      '': 'dashboard',
      tickets: 'tickets',
      pending: 'pending',
      analytics: 'analytics',
      reports: 'reports',
      feedback: 'feedback',
      settings: 'settings',
    },
    headerTitle: {
      dashboard: 'Dashboard',
      tickets: 'Department Tickets',
      pending: 'Pending Work',
      analytics: 'Analytics',
      reports: 'Reports',
      feedback: 'Feedback',
      settings: 'Settings',
    },
  },
};
