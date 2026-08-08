import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  markAllRead as markAllReadApi,
  markRead as markReadApi,
  type NotificationFeed,
} from '@/lib/api/notifications';

const KEY = ['notifications'] as const;

/** How often to ask. A maintenance helpdesk runs on a minutes-to-hours cadence
 *  — a ticket raised now is not read by an HOS in the next four seconds — so a
 *  minute is responsive enough and costs one indexed query capped at 50 rows.
 *  The window-focus refetch does more work than the interval in practice: it
 *  covers "I came back to the tab", which is when people actually look. */
const POLL_MS = 60_000;

/**
 * The notification feed.
 *
 * This is what the WebSocket used to do. When Channels was removed the socket
 * went with it, and the bell was left reading a Zustand store that no longer
 * had a writer — permanently empty, badge stuck at zero, on every desktop page.
 * Notifications were being generated and stored correctly the whole time; only
 * the delivery was missing.
 *
 * React Query is the single source of truth here rather than a store mirroring
 * it. The store existed because the socket pushed into it; with polling there
 * is nothing to mirror, and two containers for one list is two things to keep
 * in step.
 */
export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery<NotificationFeed>({
    queryKey: KEY,
    queryFn: getNotifications,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    // Keep polling while the tab is hidden but far less often — a background
    // tab open all afternoon should not keep a connection busy.
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  /** Optimistic so the badge responds to the click, not to the round trip. */
  const markRead = useMutation({
    mutationFn: markReadApi,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<NotificationFeed>(KEY);
      if (previous) {
        queryClient.setQueryData<NotificationFeed>(KEY, {
          notifications: previous.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, previous.unreadCount - (
            previous.notifications.find((n) => n.id === id)?.read ? 0 : 1
          )),
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const markAllRead = useMutation({
    mutationFn: markAllReadApi,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<NotificationFeed>(KEY);
      if (previous) {
        queryClient.setQueryData<NotificationFeed>(KEY, {
          notifications: previous.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return {
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    loading: query.isLoading,
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
    markingAll: markAllRead.isPending,
  };
}

export default useNotifications;
