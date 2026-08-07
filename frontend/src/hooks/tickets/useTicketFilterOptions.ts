import { useQuery } from '@tanstack/react-query';
import { getTicketFilterOptions, type TicketFilterOption } from '@/lib/api/tickets';

/**
 * Scoped option lists for the tickets-table filters (sections / technicians /
 * requesters). Data is scoped server-side by JWT role, so the same hook serves
 * every staff tickets page (admin = all, manager = department, hod/hos = their
 * sections) with the correct options.
 */
export function useTicketFilterOptions(enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ticket-filter-options'],
    queryFn: getTicketFilterOptions,
    enabled,
    staleTime: 2 * 60 * 1000,
  });

  return {
    sections: (data?.sections ?? []) as TicketFilterOption[],
    technicians: (data?.technicians ?? []) as TicketFilterOption[],
    requesters: (data?.requesters ?? []) as TicketFilterOption[],
    loading: isLoading,
    error: error as Error | null,
  };
}

export default useTicketFilterOptions;
