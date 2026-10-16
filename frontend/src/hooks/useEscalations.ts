// The escalation check, as the admin's SLA Rules page reads and runs it.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getEscalationStatus, runEscalations } from '@/lib/api/tickets';
import type { EscalationStatus } from '@/types';

const STATUS_KEY = ['escalations'] as const;

/** The check's state, refreshed every minute so a scheduled run shows up on its own. */
export function useEscalationStatus() {
  const { data, isLoading, error } = useQuery<EscalationStatus>({
    queryKey: STATUS_KEY,
    queryFn: getEscalationStatus,
    refetchInterval: 60 * 1000,
  });
  return { status: data ?? null, loading: isLoading, error };
}

/** Run the check now; the status and every ticket list read again after, failed or not,
 *  since a failed run is recorded and may have moved tickets before it failed. */
export function useRunEscalations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runEscalations,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}
