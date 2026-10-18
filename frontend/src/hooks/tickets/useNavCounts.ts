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

/** Long enough that navigating between pages does not refetch on every click,
 *  short enough that a resumed or escalated job shows up without a reload. */
const STALE_MS = 60_000;

const ESCALATED_PARAMS = { escalated: '1' as const, page_size: 1 };
const PENDING_PARAMS = { status: 'pending' as const, page_size: 1 };

export function useNavCounts(enabled = true): NavCounts {
  const escalated = useQuery({
    queryKey: ['nav-count', 'escalated', ESCALATED_PARAMS],
    queryFn: () => getTickets(ESCALATED_PARAMS),
    enabled,
    staleTime: STALE_MS,
  });
  const pending = useQuery({
    queryKey: ['nav-count', 'pending', PENDING_PARAMS],
    queryFn: () => getTickets(PENDING_PARAMS),
    enabled,
    staleTime: STALE_MS,
  });

  return {
    escalated: escalated.data?.count ?? 0,
    pending: pending.data?.count ?? 0,
  };
}
