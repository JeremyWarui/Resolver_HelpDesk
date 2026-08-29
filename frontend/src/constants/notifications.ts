import type { NotificationEventType } from '@/types';

/**
 * What each notification is called, and how its chip is tinted.
 *
 * Keys are exactly `Notification.EVENT_TYPES` in
 * `apps/notifications/models.py`. The desktop centre and the technician's PWA
 * had a map each — different labels, different tints, and the mobile one
 * carried an `sla_warning` the backend has never sent.
 */
export const NOTIFICATION_EVENTS: Record<NotificationEventType, { label: string; tint: string }> = {
  ticket_created:        { label: 'New Ticket', tint: 'bg-blue-50 text-blue-600' },
  ticket_assigned:       { label: 'Assigned',   tint: 'bg-purple-50 text-purple-600' },
  ticket_status_changed: { label: 'Status',     tint: 'bg-muted text-muted-foreground' },
  comment_added:         { label: 'Comment',    tint: 'bg-muted text-muted-foreground' },
  ticket_resolved:       { label: 'Resolved',   tint: 'bg-green-50 text-green-600' },
  ticket_escalated:      { label: 'Escalated',  tint: 'bg-red-50 text-red-600' },
  sla_breach:            { label: 'SLA Breach', tint: 'bg-red-50 text-red-600' },
};

/** The fallback for an event type this build does not know about. */
export const UNKNOWN_NOTIFICATION_TINT = 'bg-muted text-muted-foreground';
