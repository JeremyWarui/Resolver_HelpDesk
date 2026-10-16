// One notification row, iconed by event type.

import {
  Ticket, UserCheck, RefreshCw, MessageSquare, CheckCircle2,
  ArrowUpCircle,
} from 'lucide-react';
import { timeAgo } from '@/utils/date';
import { cn } from '@/lib/utils';
import { NOTIFICATION_EVENTS, UNKNOWN_NOTIFICATION_TINT } from '@/constants/notifications';
import type { AppNotification, NotificationEventType } from '@/types';

const EVENT_ICON: Record<NotificationEventType, React.ReactNode> = {
  ticket_created:        <Ticket className="h-4 w-4" />,
  ticket_assigned:       <UserCheck className="h-4 w-4" />,
  ticket_status_changed: <RefreshCw className="h-4 w-4" />,
  comment_added:         <MessageSquare className="h-4 w-4" />,
  ticket_resolved:       <CheckCircle2 className="h-4 w-4" />,
  ticket_escalated:      <ArrowUpCircle className="h-4 w-4" />,
};

interface NotificationItemProps {
  notification: AppNotification;
  onMarkRead?: (id: number) => void;
  /** Opens the notification's ticket. Without it a click only marks it read. */
  onOpen?: (notification: AppNotification) => void;
  className?: string;
}

/** Icon, what happened, the sender's own words when they wrote any, then time
 *  and the unread dot on the right. The icon is a fixed circle aligned to the
 *  first line, whatever the text's length. */
export function NotificationItem({ notification, onMarkRead, onOpen, className }: NotificationItemProps) {
  const tint = NOTIFICATION_EVENTS[notification.event_type]?.tint ?? UNKNOWN_NOTIFICATION_TINT;
  const opensTicket = !!onOpen && notification.ticket_id !== null;
  const unread = !notification.read;
  // A read row with no ticket to open does nothing, so it is not a control.
  const actionable = opensTicket || (unread && !!onMarkRead);
  const Row = actionable ? 'button' : 'div';

  return (
    <Row
      {...(actionable && { type: 'button' as const })}
      className={cn(
        'w-full text-left flex items-start gap-4 px-4 py-4 transition-colors',
        actionable && 'hover:bg-gray-50',
        className,
      )}
      onClick={actionable ? () => {
        if (unread) onMarkRead?.(notification.id);
        if (opensTicket) onOpen?.(notification);
      } : undefined}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tint)}>
        {EVENT_ICON[notification.event_type]}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm leading-snug', unread ? 'font-semibold text-gray-900' : 'text-gray-700')}>
          {notification.title}
        </span>
        <span className="block text-xs text-gray-500 mt-1 line-clamp-2">{notification.body}</span>
        {/* What the sender wrote, as their message. */}
        {notification.note && (
          <span className="mt-2 block rounded-md border-l-2 border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap line-clamp-4">
            {notification.note}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
        <span className="text-[11px] text-gray-400 whitespace-nowrap">{timeAgo(notification.created_at)}</span>
        {unread && (
          <>
            <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden />
            <span className="sr-only">Unread</span>
          </>
        )}
      </span>
    </Row>
  );
}
