// Types shared by the component layer: permissions, table variants, filter
// pills and the notification feed.

import type { Ticket } from './ticket.types';

/**
 * What a role may do to a ticket it can already see. Guards the buttons on the
 * ticket detail; the API is the authoritative layer.
 *
 * Actions only. Which *sections* a role reaches is `ROLE_NAV`.
 */
export interface PermissionMap {
  canAssignTicket: boolean;
  canUpdateTicketStatus: boolean;
  canCloseTicket: boolean;
  canReopenTicket: boolean;
}

export type TicketTableVariant =
  | 'queue'       // Escalated work — HOS, HOD and technician
  | 'admin'       // The Tickets page — every ticket in the caller's scope
  | 'my-tickets'  // A requester's own tickets
  | 'pending'     // Work on hold — why, for how long, and who to ask
  | 'my-jobs'     // A technician's own jobs — when each is due, never who has it
  | 'section';    // A technician's trades at their campus — who has each, and when it is due

export interface FilterPill {
  key: string;
  label: string;
  /** A ticket status tints the pill with that status's colour; `danger` is Overdue's red. */
  variant?: Ticket['status'] | 'danger';
}

/** Mirrors `SystemFeedback.CATEGORIES`. */
export type SystemFeedbackCategory = 'problem' | 'idea' | 'praise' | 'other';

/** Mirrors SystemFeedbackSerializer. The author fields are the admin's read. */
export interface SystemFeedbackEntry {
  id: number;
  category: SystemFeedbackCategory;
  message: string;
  page: string;
  reviewed: boolean;
  created_at: string;
  author_name: string;
  author_role: string;
  author_campus: string | null;
}

/** Mirrors `Notification.EVENT_TYPES`. */
export type NotificationEventType =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_status_changed'
  | 'comment_added'
  | 'ticket_resolved'
  | 'ticket_escalated';

export interface AppNotification {
  id: number;
  event_type: NotificationEventType;
  title: string;
  body: string;
  ticket_id: number | null;
  /** Who acted; null for a message nobody sent, such as an escalation. */
  actor_name: string | null;
  /** What they wrote: a handover, progress, hold or resolution note, or a
   *  comment. Empty when they wrote nothing. */
  note: string;
  read: boolean;
  created_at: string;
}

