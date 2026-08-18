import type { UserRole } from '@/types';
import {
  LayoutDashboard,
  ClipboardList,
  PlusCircle,
  Settings,
  FileText,
  Users,
  Layers,
  Building,
  MapPin,
  PenToolIcon as Tool,
  BarChart,
  CalendarIcon,
  TrendingUp,
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

export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  /** Which live count to append to the label, if any. */
  count?: SidebarCount;
}

export interface SidebarConfig {
  items: SidebarItem[];
  subtitle?: string;
}

export const SIDEBAR_CONFIG: Record<UserRole, SidebarConfig> = {
  user: {
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'userTickets', label: 'My Tickets', icon: ClipboardList },
      { id: 'submitTicket', label: 'New Ticket', icon: PlusCircle },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
  technician: {
    items: [
      { id: 'dashboard',       label: 'Section Tickets',  icon: LayoutDashboard },
      { id: 'assignedTickets', label: 'Assigned Tickets', icon: ClipboardList },
      { id: 'escalated',       label: 'Escalated',        icon: ShieldAlert, count: 'escalated' },
      { id: 'feedback',        label: 'Feedback',         icon: MessageSquare },
      { id: 'report',          label: 'Reports',          icon: FileText },
      { id: 'settings',        label: 'Settings',         icon: Settings },
    ],
  },
  hos: {
    items: [
      { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
      { id: 'tickets',      label: 'Tickets',      icon: ClipboardList },
      { id: 'pending',      label: 'Pending Work', icon: PauseCircle, count: 'pending' },
      { id: 'escalated',    label: 'Escalated',    icon: ShieldAlert, count: 'escalated' },
      { id: 'technicians',  label: 'Technicians',  icon: Users },
      { id: 'facilities',   label: 'Facilities',   icon: Building },
      { id: 'analytics',    label: 'Analytics',    icon: TrendingUp },
      { id: 'reports',      label: 'Reports',      icon: FileText },
      { id: 'feedback',     label: 'Feedback',     icon: MessageSquare },
      { id: 'sla',          label: 'SLA Tracking', icon: Timer },
      { id: 'settings',     label: 'Settings',     icon: Settings },
    ],
    subtitle: 'Section Head Portal',
  },
  hod: {
    items: [
      { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
      { id: 'tickets',      label: 'Tickets',      icon: ClipboardList },
      { id: 'pending',      label: 'Pending Work', icon: PauseCircle, count: 'pending' },
      { id: 'escalated',    label: 'Escalated',    icon: ShieldAlert, count: 'escalated' },
      { id: 'technicians',  label: 'Technicians',  icon: Users },
      // Route id stays `sections`; the page shows the trade breakdown, which is
      // the only split that varies inside a HOD's single Maintenance section.
      { id: 'sections',     label: 'Trades',       icon: Layers },
      { id: 'facilities',   label: 'Facilities',   icon: Building },
      { id: 'analytics',    label: 'Analytics',    icon: TrendingUp },
      { id: 'reports',      label: 'Reports',      icon: FileText },
      { id: 'feedback',     label: 'Feedback',     icon: MessageSquare },
      { id: 'sla',          label: 'SLA Tracking', icon: Timer },
      { id: 'settings',     label: 'Settings',     icon: Settings },
    ],
    subtitle: 'Head of Department Portal',
  },
  manager: {
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'tickets', label: 'Tickets', icon: ClipboardList },
      { id: 'pending', label: 'Pending Work', icon: PauseCircle, count: 'pending' },
      { id: 'facilities', label: 'Facilities', icon: Building },
      { id: 'analytics', label: 'Analytics', icon: TrendingUp },
      { id: 'reports', label: 'Reports', icon: FileText },
      { id: 'feedback', label: 'Feedback', icon: MessageSquare },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
    subtitle: 'Manager Portal',
  },
  admin: {
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart },
      { id: 'tickets', label: 'Tickets', icon: ClipboardList },
      { id: 'reports', label: 'Reports', icon: FileText },
      { id: 'analytics', label: 'Analytics', icon: TrendingUp },
      { id: 'schedule', label: 'Schedule', icon: CalendarIcon },
      { id: 'technicians', label: 'Technicians', icon: Users },
      { id: 'facilities', label: 'Facilities', icon: Building },
      { id: 'sections', label: 'Sections', icon: Layers },
      { id: 'campuses', label: 'Campuses', icon: MapPin },
      { id: 'departments', label: 'Departments', icon: Layers },
      { id: 'inventory', label: 'Service Catalogue', icon: Tool },
      { id: 'users', label: 'Users', icon: UserCog },
      { id: 'sla-rules', label: 'SLA Rules', icon: Clock },
      { id: 'audit-log', label: 'Audit Log', icon: ShieldAlert },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
};
