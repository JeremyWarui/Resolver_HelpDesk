import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationPage,
  getNotifications,
  markAllRead as markAllReadApi,
  markRead as markReadApi,
  type NotificationFeed,
  type NotificationQuery,
} from '@/lib/api/notifications';

const KEY = ['notifications'] as const;

/** How often to ask. A helpdesk runs on a minutes-to-hours cadence, so a minute
 *  is responsive enough and costs one indexed query capped at 50 rows. */
const POLL_MS = 60_000;

/**
 * The notification feed. Notifications are polled, not pushed.
 *
 * React Query holds the list. A store mirroring it would be a second container
 * for one list, and two things to keep in step.
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
    onMutate: async (id: number) => {
      // Exact: a prefix match would also cancel a Load more in flight.
      await queryClient.cancelQueries({ queryKey: KEY, exact: true });
      const previous = queryClient.getQueryData<NotificationFeed>(KEY);
      if (previous) {
        queryClient.setQueryData<NotificationFeed>(KEY, {
          results: previous.results.map((n) => (n.id === id ? { ...n, read: true } : n)),
          unread_count: Math.max(
            0,
            previous.unread_count - (previous.results.find((n) => n.id === id)?.read ? 0 : 1),
          ),
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
      // Exact: a prefix match would also cancel a Load more in flight.
      await queryClient.cancelQueries({ queryKey: KEY, exact: true });
      const previous = queryClient.getQueryData<NotificationFeed>(KEY);
      if (previous) {
        queryClient.setQueryData<NotificationFeed>(KEY, {
          results: previous.results.map((n) => ({ ...n, read: true })),
          unread_count: 0,
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
    notifications: query.data?.results ?? [],
    unreadCount: query.data?.unread_count ?? 0,
    loading: query.isLoading,
    markRead: (id: number) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
    markingAll: markAllRead.isPending,
  };
}

/**
 * The whole feed for the Notifications page, a page at a time, filtered
 * server-side. Its key sits under the feed's, so marking a row read refreshes
 * both.
 */
export function useNotificationHistory(query: Omit<NotificationQuery, 'before'>) {
  const result = useInfiniteQuery({
    queryKey: [...KEY, 'history', query.unread ?? false, query.eventTypes?.join(',') ?? '', query.limit ?? 0],
    queryFn: ({ pageParam }) => getNotificationPage({ ...query, before: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.has_more ? last.results[last.results.length - 1]?.id : undefined),
    staleTime: 30_000,
  });

  return {
    notifications: result.data?.pages.flatMap((p) => p.results) ?? [],
    loading: result.isLoading,
    hasMore: result.hasNextPage,
    loadingMore: result.isFetchingNextPage,
    loadMore: () => result.fetchNextPage(),
  };
}
