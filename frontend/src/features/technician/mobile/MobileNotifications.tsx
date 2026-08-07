import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNotifications, markRead, markAllRead } from '@/lib/api/notifications';
import type { AppNotification } from '@/types';

const EVENT_COLOR: Record<string, string> = {
  ticket_created:        'bg-blue-100 text-blue-700',
  ticket_assigned:       'bg-yellow-100 text-yellow-700',
  ticket_status_changed: 'bg-purple-100 text-purple-700',
  ticket_escalated:      'bg-red-100 text-red-700',
  ticket_resolved:       'bg-green-100 text-green-700',
  comment_added:         'bg-indigo-100 text-indigo-700',
  sla_warning:           'bg-orange-100 text-orange-700',
  sla_breach:            'bg-red-100 text-red-700',
};

const EVENT_LABEL: Record<string, string> = {
  ticket_created:        'New Ticket',
  ticket_assigned:       'Assigned',
  ticket_status_changed: 'Status',
  ticket_escalated:      'Escalated',
  ticket_resolved:       'Resolved',
  comment_added:         'Comment',
  sla_warning:           'SLA Warning',
  sla_breach:            'SLA Breach',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function MobileNotifications() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<AppNotification[]>({
    queryKey: ['mobile-notifications'],
    queryFn: getNotifications,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const { mutate: readOne } = useMutation({
    mutationFn: markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-notifications'] }),
  });

  const { mutate: readAll, isPending: markingAll } = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-notifications'] }),
  });

  const notifications = data ?? [];
  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={() => readAll()}
            disabled={markingAll}
            className="flex items-center gap-1 text-xs text-primary disabled:opacity-40"
          >
            {markingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white border border-border animate-pulse" />
          ))
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No notifications</p>
            <p className="text-xs text-muted-foreground/70 mt-1">You're all caught up</p>
          </div>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              onClick={() => { if (!n.read) readOne(n.id); }}
              className={cn(
                'w-full text-left rounded-xl border p-4 transition-colors',
                n.read
                  ? 'bg-white border-border'
                  : 'bg-blue-50/60 border-blue-200'
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                  EVENT_COLOR[n.eventType] ?? 'bg-gray-100 text-gray-600'
                )}>
                  {EVENT_LABEL[n.eventType] ?? n.eventType}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(n.createdAt)}</span>
              </div>
              <p className="text-sm font-medium text-foreground leading-snug">{n.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
