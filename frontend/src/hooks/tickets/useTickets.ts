// Reading lists of tickets: the feed itself, the ratings on it, and the option
// lists its filters are built from. All three come off `lib/api/tickets`, and
// every ticket table uses at least two of them.

import { useQuery } from '@tanstack/react-query';
import {
  getTickets,
  getFeedback,
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

/** Role-scoped feedback list. No scope params: the server derives breadth from
 *  the JWT role — a technician gets their own, everyone above gets their whole
 *  scope. */
export const useFeedback = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'feedback'],
    queryFn: getFeedback,
    staleTime: 60 * 1000,
  });

  return {
    feedback: (data?.results ?? []) as TicketFeedbackRow[],
    loading: isLoading,
    error: error as Error | null,
  };
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
