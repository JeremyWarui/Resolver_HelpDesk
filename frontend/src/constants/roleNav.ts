// The one navigation model. Per role, the sections it has: what the sidebar
// draws, what URL each sits at, and what the header calls it.
//
// These were five maps in four files — the sidebar's items, the sidebar's
// id → URL table, `sectionFromPath` and `headerTitle` here, and a private copy
// of the last two inside AdminLayout. A section's label was written twice and
// its URL twice, so a renamed section left a sidebar entry pointing at a
// section no layout had.

import type { UserRole } from '@/types';
import {
  LayoutDashboard,
  ClipboardList,
  PlusCircle,
  FileText,
  Users,
  Building,
  MapPin,
  PenToolIcon as Tool,
  BarChart,
  UserCog,
  Clock,
  ShieldAlert,
  Timer,
  MessageSquare,
  PauseCircle,
} from 'lucide-react';

/** Live count shown beside a nav label, e.g. "Escalated (8)".
 *
 *  Only queues worth chasing carry one. A count on "Tickets" would be the
 *  section's whole backlog — a number nobody acts on, redrawn on every poll. */
export type SidebarCount = 'escalated' | 'pending';

interface NavItem {
  /** Section key: the sidebar's item, the layout's section map key, and the
   *  header title, all keyed the same. */
  id: string;
  /** URL sub-segment under the role's base path. '' is the landing section. */
  path: string;
  label: string;
  icon: React.ElementType;
  /** Which live count to append to the label, if any. */
  count?: SidebarCount;
  /** Opens the ticket wizard instead of routing to a section. */
  opensWizard?: boolean;
}

export interface RoleNav {
  items: NavItem[];
  subtitle?: string;
}

export const ROLE_NAV: Record<UserRole, RoleNav> = {
  user: {
    items: [
      { id: 'dashboard',    path: '',        label: 'Dashboard',  icon: LayoutDashboard },
      { id: 'userTickets',  path: 'tickets', label: 'My Tickets', icon: ClipboardList },
      { id: 'submitTicket', path: 'new',     label: 'New Ticket', icon: PlusCircle, opensWizard: true },
    ],
  },
  technician: {
    items: [
      { id: 'dashboard',       path: '',          label: 'Section Tickets',  icon: LayoutDashboard },
      { id: 'assignedTickets', path: 'assigned',  label: 'Assigned Tickets', icon: ClipboardList },
      { id: 'pending',         path: 'pending',   label: 'Pending Work',     icon: PauseCircle, count: 'pending' },
      { id: 'escalated',       path: 'escalated', label: 'Escalated',        icon: ShieldAlert, count: 'escalated' },
      { id: 'feedback',        path: 'feedback',  label: 'Feedback',         icon: MessageSquare },
      { id: 'reports',         path: 'reports',   label: 'Reports',          icon: FileText },
    ],
  },
  hos: {
    items: [
      { id: 'dashboard',   path: '',            label: 'Dashboard',    icon: LayoutDashboard },
      { id: 'tickets',     path: 'tickets',     label: 'Tickets',      icon: ClipboardList },
      { id: 'pending',     path: 'pending',     label: 'Pending Work', icon: PauseCircle, count: 'pending' },
      { id: 'escalated',   path: 'escalated',   label: 'Escalated',    icon: ShieldAlert, count: 'escalated' },
      { id: 'technicians', path: 'technicians', label: 'Technicians',  icon: Users },
      { id: 'facilities',  path: 'facilities',  label: 'Facilities',   icon: Building },
      { id: 'reports',     path: 'reports',     label: 'Reports',      icon: FileText },
      { id: 'feedback',    path: 'feedback',    label: 'Feedback',     icon: MessageSquare },
      { id: 'sla',         path: 'sla',         label: 'SLA Tracking', icon: Timer },
    ],
    subtitle: 'Section Head Portal',
  },
  hod: {
    items: [
      { id: 'dashboard',   path: '',            label: 'Dashboard',    icon: LayoutDashboard },
      { id: 'tickets',     path: 'tickets',     label: 'Tickets',      icon: ClipboardList },
      { id: 'pending',     path: 'pending',     label: 'Pending Work', icon: PauseCircle, count: 'pending' },
      { id: 'escalated',   path: 'escalated',   label: 'Escalated',    icon: ShieldAlert, count: 'escalated' },
      { id: 'technicians', path: 'technicians', label: 'Technicians',  icon: Users },
      { id: 'facilities',  path: 'facilities',  label: 'Facilities',   icon: Building },
      { id: 'reports',     path: 'reports',     label: 'Reports',      icon: FileText },
      { id: 'feedback',    path: 'feedback',    label: 'Feedback',     icon: MessageSquare },
      { id: 'sla',         path: 'sla',         label: 'SLA Tracking', icon: Timer },
    ],
    subtitle: 'Head of Department Portal',
  },
  // Reporting and analytics across every campus (REVIEW.md §4). Oversight is
  // read-only, so no operational queue: holds are on the reports page, where
  // the figure comes from the server's aggregate rather than one page of rows.
  manager: {
    items: [
      { id: 'dashboard',  path: '',           label: 'Dashboard',  icon: LayoutDashboard },
      { id: 'tickets',    path: 'tickets',    label: 'Tickets',    icon: ClipboardList },
      { id: 'facilities', path: 'facilities', label: 'Facilities', icon: Building },
      { id: 'reports',    path: 'reports',    label: 'Reports',    icon: FileText },
      { id: 'feedback',   path: 'feedback',   label: 'Feedback',   icon: MessageSquare },
    ],
    subtitle: 'Manager Portal',
  },
  admin: {
    items: [
      { id: 'dashboard',   path: '',            label: 'Dashboard',         icon: BarChart },
      { id: 'tickets',     path: 'tickets',     label: 'Tickets',           icon: ClipboardList },
      { id: 'reports',     path: 'reports',     label: 'Reports',           icon: FileText },
      { id: 'technicians', path: 'technicians', label: 'Technicians',       icon: Users },
      { id: 'facilities',  path: 'facilities',  label: 'Facilities',        icon: Building },
      { id: 'campuses',    path: 'campuses',    label: 'Campuses',          icon: MapPin },
      { id: 'inventory',   path: 'catalogue',   label: 'Service Catalogue', icon: Tool },
      { id: 'users',       path: 'users',       label: 'Users',             icon: UserCog },
      { id: 'sla-rules',   path: 'sla-rules',   label: 'SLA Rules',         icon: Clock },
      { id: 'audit-log',   path: 'audit-log',   label: 'Audit Log',         icon: ShieldAlert },
    ],
  },
};

/** The section a URL is showing. An unknown sub-segment lands on the role's
 *  first item, so a stale bookmark opens the dashboard rather than nothing. */
export function sectionFromPath(nav: RoleNav, pathname: string): string {
  const sub = pathname.split('/').filter(Boolean)[1] ?? '';
  return nav.items.find((item) => item.path === sub)?.id ?? nav.items[0].id;
}

/** What the header calls a section. */
export function sectionTitle(nav: RoleNav, id: string): string {
  return nav.items.find((item) => item.id === id)?.label ?? 'Dashboard';
}
