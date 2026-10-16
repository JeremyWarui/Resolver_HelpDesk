import { useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationItem } from '@/components/shared/feedback/NotificationItem';
import { useNotificationHistory, useNotifications } from '@/hooks/useNotifications';
import { TabBar } from '@/components/shared/data/TabBar';
import type { AppNotification } from '@/types';

/** The filters, each a server-side query. Keys are `Notification.EVENT_TYPES`. */
const FILTERS: Record<string, { unread?: boolean; eventTypes?: readonly string[] }> = {
  all: {},
  unread: { unread: true },
  comments: { eventTypes: ['comment_added'] },
  status: { eventTypes: ['ticket_status_changed', 'ticket_resolved'] },
  assigned: { eventTypes: ['ticket_created', 'ticket_assigned', 'ticket_escalated'] },
};

/** About one screenful of rows per page, so "Load more" sits near the fold.
 *  Measured once when the page opens: a row is roughly 80px under a 240px header. */
function screenfulPageSize(): number {
  return Math.min(20, Math.max(6, Math.floor((window.innerHeight - 240) / 80)));
}

const TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'comments', label: 'Comments' },
  { key: 'status', label: 'Status updates' },
  { key: 'assigned', label: 'New & assigned' },
];

/** "Today", "Yesterday", or the date, for a day heading. */
function dayLabel(iso: string): string {
  const day = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return day.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

interface NotificationsPageProps {
  /** Opens a ticket's detail. A role that opens no ticket leaves it out. */
  onTicketSelect?: (id: number) => void;
}

/** Every notification the account has had, by day, filtered server-side. */
export default function NotificationsPage({ onTicketSelect }: NotificationsPageProps) {
  const [filter, setFilter] = useState('all');
  const [pageSize] = useState(screenfulPageSize);
  const { unreadCount, markRead, markAllRead, markingAll } = useNotifications();
  const { notifications, loading, hasMore, loadingMore, loadMore } = useNotificationHistory({ ...FILTERS[filter], limit: pageSize });

  const byDay = useMemo(() => {
    const groups: { day: string; items: AppNotification[] }[] = [];
    for (const n of notifications) {
      const day = dayLabel(n.created_at);
      if (groups[groups.length - 1]?.day !== day) groups.push({ day, items: [] });
      groups[groups.length - 1].items.push(n);
    }
    return groups;
  }, [notifications]);

  return (
    <div className="p-4 sm:p-6">
      <Card className="overflow-hidden max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">Notifications</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={unreadCount === 0 || markingAll}
            onClick={markAllRead}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        </div>

        <TabBar
          tabs={TABS.map((t) => ({ ...t, count: t.key === 'unread' ? unreadCount : undefined }))}
          active={filter}
          onSelect={setFilter}
          panelId="notifications-panel"
          label="Show"
        />

        <div role="tabpanel" id="notifications-panel" aria-labelledby={`notifications-panel-tab-${filter}`}>
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Bell className="h-8 w-8 text-gray-300" aria-hidden />
              <p className="text-sm font-medium text-gray-600">
                {filter === 'unread' ? 'Nothing unread' : 'No notifications here'}
              </p>
              <p className="text-xs text-gray-400">
                {filter === 'all' ? 'Updates on your tickets will appear here.' : 'Try another filter.'}
              </p>
            </div>
          ) : (
            byDay.map(({ day, items }) => (
              <section key={day} aria-label={day}>
                <h3 className="px-5 sm:px-6 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 bg-gray-50/70 border-b border-gray-100">
                  {day}
                </h3>
                <div className="divide-y divide-gray-100">
                  {items.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onMarkRead={markRead}
                      onOpen={onTicketSelect ? (item) => onTicketSelect(item.ticket_id!) : undefined}
                      className="px-5 sm:px-6"
                    />
                  ))}
                </div>
              </section>
            ))
          )}

          {hasMore && (
            <div className="p-4 border-t border-gray-100 text-center">
              <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
