import { useQuery } from '@tanstack/react-query';
import { getTicketFilterOptions, type TicketFilterOption } from '@/lib/api/tickets';

/**
 * Scoped option lists for the tickets-table filters (sections / trades /
 * technicians / requesters). Data is scoped server-side by JWT role, so the
 * same hook serves every staff tickets page (admin = all, manager =
 * department, hod/hos = their sections) with the correct options.
 *
 * `subSections` is the useful axis below a HOD/HOS: their scope contains a
 * single Maintenance section, so a section filter there has exactly one
 * choice, while the trade filter has one per craft.
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
    subSections: (data?.sub_sections ?? []) as TicketFilterOption[],
    technicians: (data?.technicians ?? []) as TicketFilterOption[],
    requesters: (data?.requesters ?? []) as TicketFilterOption[],
    loading: isLoading,
    error: error as Error | null,
  };
}

export default useTicketFilterOptions;
