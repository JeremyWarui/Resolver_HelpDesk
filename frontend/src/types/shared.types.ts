// Types shared by the component layer: permissions, table variants, filter
// pills and the notification feed.

/**
 * What a role may do to a ticket it can already see. Guards the buttons on the
 * ticket detail; the API is the authoritative layer.
 *
 * Actions only. Which *sections* a role reaches is `ROLE_NAV`; stating it here
 * too would be a second copy nothing checks against the first.
 */
export interface PermissionMap {
  canAssignTicket: boolean;
  canReassignTicket: boolean;
  canUpdateTicketStatus: boolean;
  canCloseTicket: boolean;
  canReopenTicket: boolean;
}

export type TicketTableVariant =
  | 'queue'       // HOS/HOD/Technician — full columns, bulk actions, filter bar
  | 'sla'         // SLA tracking — replaces date cols with countdown bar
  | 'admin'       // Admin view — all columns including internal fields
  | 'my-tickets'  // User's own ticket history — mid-density
  | 'pending';    // Work on hold — why, for how long, and who to ask

export interface FilterPill {
  key: string;
  label: string;
  count?: number;
  variant?: 'default' | 'danger' | 'warning' | 'success'
           | 'open' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'closed';
}

/** Mirrors `Notification.EVENT_TYPES`. */
export type NotificationEventType =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_status_changed'
  | 'comment_added'
  | 'ticket_resolved'
  | 'ticket_escalated'
  | 'sla_breach';

export interface AppNotification {
  id: number;
  event_type: NotificationEventType;
  title: string;
  body: string;
  ticket_id: number | null;
  read: boolean;
  created_at: string;
}

