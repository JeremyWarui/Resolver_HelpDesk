/**
 * Live counts for the supervisors' sidebar: "Escalated (8)", "Pending Work (3)".
 *
 * `page_size: 1` on purpose: only `count` is read. The queries are role-scoped
 * server-side like every other ticket read, so a HOS's badge counts their
 * section. A technician's sidebar has no counted item: their counts are the
 * My Jobs tabs.
 */
import { useQuery } from '@tanstack/react-query';
import { getTickets } from '@/lib/api/tickets';

interface NavCounts {
  escalated: number;
  pending: number;
}

/** Long enough that navigating between pages does not refetch on every click.
 *  The poll picks up what changes server-side, like a scheduled escalation. */
const STALE_MS = 60_000;

const ESCALATED_PARAMS = { escalated: '1' as const, page_size: 1 };
const PENDING_PARAMS = { status: 'pending' as const, page_size: 1 };

export function useNavCounts(enabled = true): NavCounts {
  const escalated = useQuery({
    queryKey: ['tickets', 'nav-count', 'escalated'],
    queryFn: () => getTickets(ESCALATED_PARAMS),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
  });
  const pending = useQuery({
    queryKey: ['tickets', 'nav-count', 'pending'],
    queryFn: () => getTickets(PENDING_PARAMS),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
  });

  return {
    escalated: escalated.data?.count ?? 0,
    pending: pending.data?.count ?? 0,
  };
}
