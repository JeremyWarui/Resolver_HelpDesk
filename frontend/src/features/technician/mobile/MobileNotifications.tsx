import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import { timeAgo } from '@/utils/date';
import { NOTIFICATION_EVENTS, UNKNOWN_NOTIFICATION_TINT } from '@/constants/notifications';

export function MobileNotifications() {
  const {
    notifications,
    unreadCount: unread,
    loading: isLoading,
    markRead: readOne,
    markAllRead: readAll,
    markingAll,
  } = useNotifications();

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
                  NOTIFICATION_EVENTS[n.event_type]?.tint ?? UNKNOWN_NOTIFICATION_TINT
                )}>
                  {NOTIFICATION_EVENTS[n.event_type]?.label ?? n.event_type}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
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
