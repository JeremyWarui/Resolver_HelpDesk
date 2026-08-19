import { useQuery } from '@tanstack/react-query';
import ticketsService from '@/lib/api/tickets';
import type { TicketFeedbackParams, TicketFeedbackRow } from '@/lib/api/tickets';

interface UseFeedbackResult {
  feedback: TicketFeedbackRow[];
  totalFeedback: number;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Role-scoped feedback list — no scope params passed, the server derives
 *  breadth from the JWT role (technician=own, HOS/HOD/Manager/Admin=full
 *  scope). `skip` gates the query for role-conditional tabs. */
export const useFeedback = (params?: TicketFeedbackParams, skip = false): UseFeedbackResult => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tickets', 'feedback', params],
    queryFn: () => ticketsService.getFeedback(params),
    enabled: !skip,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return {
    feedback: data?.results ?? [],
    totalFeedback: data?.count ?? 0,
    loading: isLoading,
    error: error as Error | null,
    refetch,
  };
};
