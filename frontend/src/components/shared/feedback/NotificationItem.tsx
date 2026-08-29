// One notification row, iconed by event type.

import {
  Ticket, UserCheck, RefreshCw, MessageSquare, CheckCircle2,
  ArrowUpCircle, ShieldAlert,
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
  sla_breach:            <ShieldAlert className="h-4 w-4" />,
};

interface NotificationItemProps {
  notification: AppNotification;
  onMarkRead?: (id: number) => void;
  className?: string;
}

export function NotificationItem({ notification, onMarkRead, className }: NotificationItemProps) {
  const iconColorClass = NOTIFICATION_EVENTS[notification.event_type]?.tint ?? UNKNOWN_NOTIFICATION_TINT;

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50 cursor-default',
        !notification.read && 'bg-primary/5',
        className,
      )}
      onClick={() => !notification.read && onMarkRead?.(notification.id)}
    >
      <div className={cn('mt-0.5 p-1.5 rounded-full shrink-0', iconColorClass)}>
        {EVENT_ICON[notification.event_type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug', !notification.read && 'font-semibold')}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(notification.created_at)}</p>
      </div>
      {!notification.read && (
        <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
      )}
    </div>
  );
}
