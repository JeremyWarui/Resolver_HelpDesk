// NotificationItem — single notification row with icon per eventType.

import {
  Ticket, UserCheck, RefreshCw, MessageSquare, CheckCircle2,
  ArrowUpCircle, AlertTriangle, ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationEventType } from '@/types';

const EVENT_ICON: Record<NotificationEventType, React.ReactNode> = {
  ticket_created:        <Ticket className="h-4 w-4" />,
  ticket_assigned:       <UserCheck className="h-4 w-4" />,
  ticket_status_changed: <RefreshCw className="h-4 w-4" />,
  comment_added:         <MessageSquare className="h-4 w-4" />,
  ticket_resolved:       <CheckCircle2 className="h-4 w-4" />,
  ticket_escalated:      <ArrowUpCircle className="h-4 w-4" />,
  sla_warning:           <AlertTriangle className="h-4 w-4" />,
  sla_breach:            <ShieldAlert className="h-4 w-4" />,
};

const EVENT_COLOR: Record<NotificationEventType, string> = {
  ticket_created:        'bg-blue-50 text-blue-600',
  ticket_assigned:       'bg-purple-50 text-purple-600',
  ticket_status_changed: 'bg-muted text-muted-foreground',
  comment_added:         'bg-muted text-muted-foreground',
  ticket_resolved:       'bg-green-50 text-green-600',
  ticket_escalated:      'bg-red-50 text-red-600',
  sla_warning:           'bg-amber-50 text-amber-600',
  sla_breach:            'bg-red-50 text-red-600',
};

function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface NotificationItemProps {
  notification: AppNotification;
  onMarkRead?: (id: string) => void;
  className?: string;
}

export function NotificationItem({ notification, onMarkRead, className }: NotificationItemProps) {
  const iconColorClass = EVENT_COLOR[notification.eventType] ?? 'bg-muted text-muted-foreground';

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
        {EVENT_ICON[notification.eventType]}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug', !notification.read && 'font-semibold')}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{formatRelative(notification.createdAt)}</p>
      </div>
      {!notification.read && (
        <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
      )}
    </div>
  );
}
