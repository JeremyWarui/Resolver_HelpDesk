// Reading lists of tickets: the feed itself, the ratings on it, and the option
// lists its filters are built from. All three come off `lib/api/tickets`, and
// every ticket table uses at least two of them.

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getTickets,
  getFeedback,
  getFeedbackSummary,
  type FeedbackWindow,
  getTicketFilterOptions,
  type TicketFeedbackRow,
  type TicketFilterOption,
  type PendingReasonOption,
} from '@/lib/api/tickets';
import type { Ticket, TicketsParams } from '@/types';

interface UseTicketsResult {
  tickets: Ticket[];
  totalTickets: number;
  loading: boolean;
  refetch: () => void;
}

/** The ticket feed for the caller's scope. `params` narrow it; they never widen
 *  it, because the queryset is already role-scoped server-side. */
export const useTickets = (params?: TicketsParams, skip = false): UseTicketsResult => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tickets', params],
    queryFn: () => getTickets(params),
    enabled: !skip,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

  return {
    tickets: data?.results ?? [],
    totalTickets: data?.count ?? 0,
    loading: isLoading,
    refetch,
  };
};

/** The window's ratings, a page at a time. Scope comes from the server: a
 *  technician gets their own jobs, everyone above their whole scope. */
export const useFeedback = (window: FeedbackWindow, rating: number | null) => {
  const result = useInfiniteQuery({
    queryKey: ['tickets', 'feedback', window.date_from, window.date_to, rating],
    queryFn: ({ pageParam }) => getFeedback(window, rating, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
    staleTime: 60 * 1000,
  });

  return {
    feedback: (result.data?.pages.flatMap((p) => p.results) ?? []) as TicketFeedbackRow[],
    total: result.data?.pages[0]?.count ?? 0,
    loading: result.isLoading,
    error: result.error as Error | null,
    hasMore: result.hasNextPage,
    loadingMore: result.isFetchingNextPage,
    loadMore: () => result.fetchNextPage(),
  };
};

/** The window's figures, over every rating in it. */
export const useFeedbackSummary = (window: FeedbackWindow) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'feedback', 'summary', window.date_from, window.date_to],
    queryFn: () => getFeedbackSummary(window),
    staleTime: 60 * 1000,
  });
  return { summary: data ?? null, loading: isLoading, error: error as Error | null };
};

/** The option lists for the tickets-table filters, scoped server-side — so a
 *  dropdown can never offer an id whose tickets the caller would be refused. */
export function useTicketFilterOptions(enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ticket-filter-options'],
    queryFn: getTicketFilterOptions,
    enabled,
    staleTime: 2 * 60 * 1000,
  });

  return {
    campuses: (data?.campuses ?? []) as TicketFilterOption[],
    trades: (data?.trades ?? []) as TicketFilterOption[],
    technicians: (data?.technicians ?? []) as TicketFilterOption[],
    requesters: (data?.requesters ?? []) as TicketFilterOption[],
    pendingReasons: (data?.pending_reasons ?? []) as PendingReasonOption[],
    loading: isLoading,
    error: error as Error | null,
  };
}
