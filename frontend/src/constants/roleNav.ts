// The one navigation model. Per role, the sections it has: what the sidebar
// draws, what URL each sits at, and what the header calls it.

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
  MessageSquare,
  PauseCircle,
  Bell,
  MessagesSquare,
  Wrench,
  Hand,
} from 'lucide-react';

/** Live count shown beside a nav label, e.g. "Escalated (8)". Only queues
 *  worth chasing carry one. */
export type SidebarCount = 'escalated' | 'pending' | 'notifications' | 'systemFeedback';

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
  /** A tab of another section: routed and rendered, but not listed in the
   *  sidebar, which marks `parent` instead and names the header after it. */
  parent?: string;
  /** Left out of the phone menu. Someone out on a job reaches what they act
   *  on there; the full registers stay on a computer. The URL still opens. */
  desktopOnly?: true;
}

interface RoleNav {
  items: NavItem[];
  subtitle?: string;
}

/** The HOS and the HOD read the same sections; scope is what differs, and the server decides it. */
const SUPERVISOR_ITEMS: NavItem[] = [
  { id: 'dashboard',   path: '',            label: 'Dashboard',    icon: LayoutDashboard },
  { id: 'tickets',     path: 'tickets',     label: 'Tickets',      icon: ClipboardList },
  { id: 'pending',     path: 'pending',     label: 'Pending Work', icon: PauseCircle, count: 'pending' },
  { id: 'escalated',   path: 'escalated',   label: 'Escalated',    icon: ShieldAlert, count: 'escalated' },
  { id: 'technicians', path: 'technicians', label: 'Technicians',  icon: Users },
  { id: 'facilities',  path: 'facilities',  label: 'Facilities',   icon: Building },
  { id: 'reports',     path: 'reports',     label: 'Reports',      icon: FileText },
  { id: 'feedback',    path: 'feedback',    label: 'Feedback',     icon: MessageSquare },
  { id: 'notifications', path: 'notifications', label: 'Notifications', icon: Bell, count: 'notifications' },
];

export const ROLE_NAV: Record<UserRole, RoleNav> = {
  user: {
    items: [
      { id: 'dashboard',    path: '',        label: 'Dashboard',  icon: LayoutDashboard },
      { id: 'userTickets',  path: 'tickets', label: 'My Tickets', icon: ClipboardList, desktopOnly: true },
      { id: 'submitTicket', path: 'new',     label: 'New Ticket', icon: PlusCircle, opensWizard: true },
      { id: 'notifications', path: 'notifications', label: 'Notifications', icon: Bell, count: 'notifications' },
    ],
  },
  technician: {
    items: [
      { id: 'dashboard',       path: '',          label: 'My Jobs',          icon: Wrench },
      { id: 'available',       path: 'available', label: 'Available',        icon: Hand,          parent: 'dashboard' },
      { id: 'pending',         path: 'pending',   label: 'On Hold',          icon: PauseCircle,   parent: 'dashboard' },
      { id: 'escalated',       path: 'escalated', label: 'Escalated',        icon: ShieldAlert,   parent: 'dashboard' },
      { id: 'assignedTickets', path: 'assigned',  label: 'All My Jobs',      icon: ClipboardList, parent: 'dashboard' },
      { id: 'section',         path: 'section',   label: 'Section Tickets',  icon: LayoutDashboard, desktopOnly: true },
      { id: 'reports',         path: 'reports',   label: 'My Reports',       icon: FileText },
      { id: 'feedback',        path: 'feedback',  label: 'My Feedback',      icon: MessageSquare },
      { id: 'notifications', path: 'notifications', label: 'Notifications', icon: Bell, count: 'notifications' },
    ],
  },
  hos: {
    items: SUPERVISOR_ITEMS,
    subtitle: 'Section Head Portal',
  },
  hod: {
    items: SUPERVISOR_ITEMS,
    subtitle: 'Head of Department Portal',
  },
  // The admin's view of the organisation, read-only, without the configuration
  // screens. The ticket table lists every campus; no ticket opens.
  manager: {
    items: [
      { id: 'dashboard',   path: '',            label: 'Dashboard',   icon: LayoutDashboard },
      { id: 'tickets',     path: 'tickets',     label: 'Tickets',     icon: ClipboardList },
      { id: 'reports',     path: 'reports',     label: 'Reports',     icon: FileText },
      { id: 'technicians', path: 'technicians', label: 'Technicians', icon: Users },
      { id: 'facilities',  path: 'facilities',  label: 'Facilities',  icon: Building },
      { id: 'campuses',    path: 'campuses',    label: 'Campuses',    icon: MapPin },
      { id: 'feedback',    path: 'feedback',    label: 'Feedback',    icon: MessageSquare },
      { id: 'notifications', path: 'notifications', label: 'Notifications', icon: Bell, count: 'notifications' },
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
      { id: 'system-feedback', path: 'system-feedback', label: 'System Feedback', icon: MessagesSquare, count: 'systemFeedback' },
      { id: 'notifications', path: 'notifications', label: 'Notifications', icon: Bell, count: 'notifications' },
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
  const item = nav.items.find((i) => i.id === id);
  const named = item?.parent ? nav.items.find((i) => i.id === item.parent) : item;
  return named?.label ?? 'Dashboard';
}

/** The sidebar entry a section lights up: itself, or the section it is a tab of. */
export function sidebarSection(nav: RoleNav, id: string): string {
  return nav.items.find((item) => item.id === id)?.parent ?? id;
}
