import type { NotificationEventType, UserRole } from '@/types';

/**
 * What each notification is called, and how its chip is tinted.
 *
 * Keys are exactly `Notification.EVENT_TYPES` in
 * `apps/notifications/models.py`.
 */
export const NOTIFICATION_EVENTS: Record<NotificationEventType, { label: string; tint: string }> = {
  ticket_created:        { label: 'New Ticket', tint: 'bg-blue-50 text-blue-600' },
  ticket_assigned:       { label: 'Assigned',   tint: 'bg-purple-50 text-purple-600' },
  ticket_status_changed: { label: 'Status',     tint: 'bg-gray-100 text-gray-600' },
  comment_added:         { label: 'Comment',    tint: 'bg-sky-50 text-sky-600' },
  ticket_resolved:       { label: 'Resolved',   tint: 'bg-green-50 text-green-600' },
  ticket_escalated:      { label: 'Escalated',  tint: 'bg-red-50 text-red-600' },
};

/** The fallback for an event type this build does not know about. */
export const UNKNOWN_NOTIFICATION_TINT = 'bg-muted text-muted-foreground';

/** Who a status note reaches, said under the note field. Mirrors
 *  `emit_ticket_status_changed` and `emit_ticket_resolved`: the HOS hears of
 *  holds, resumes and resolutions, unless the HOS is the one writing. */
export function noteAudience(alsoHos: boolean, writerRole: UserRole | null): string {
  return alsoHos && writerRole !== 'hos'
    ? 'Sent as a message to the requester and the head of section.'
    : 'Sent as a message to the requester.';
}
