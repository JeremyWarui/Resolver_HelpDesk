import { useQuery } from '@tanstack/react-query';
import ticketsService from '@/lib/api/tickets';
import type { Ticket, TicketsParams } from '@/types';

interface UseTicketsResult {
  tickets: Ticket[];
  totalTickets: number;
  nextPage: string | null;
  prevPage: string | null;
  counts: Record<string, number>;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export const useTickets = (params?: TicketsParams, skip = false): UseTicketsResult => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tickets', params],
    queryFn: () => ticketsService.getTickets(params),
    enabled: !skip,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });

  return {
    tickets: data?.results ?? [],
    totalTickets: data?.count ?? 0,
    nextPage: data?.next ?? null,
    prevPage: data?.previous ?? null,
    counts: {},
    loading: isLoading,
    error: error as Error | null,
    refetch,
  };
};

export default useTickets;
