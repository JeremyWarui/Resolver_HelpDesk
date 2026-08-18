/**
 * Live counts for the sidebar — "Escalated (8)", "Pending Work (3)".
 *
 * Both are one-line answers to "is there anything here worth opening?", which
 * is otherwise only answerable by opening the page. Escalated and Pending are
 * the two queues where the answer is usually *no* and the cost of checking was
 * a full navigation.
 *
 * `page_size: 1` on purpose: only `count` is read, so this fetches one row
 * rather than the two-hundred the pages themselves ask for. The queries are
 * role-scoped server-side like every other ticket read, so a HOS's badge counts
 * their section and a technician's counts their trades — no client filtering,
 * and no way for the number to disagree with the page it labels.
 *
 * Shared query keys with the pages would be wrong here (different params), but
 * TanStack still dedupes these two across every consumer of the sidebar.
 */
import { useQuery } from '@tanstack/react-query';
import ticketsService from '@/lib/api/tickets';

export interface NavCounts {
  escalated: number;
  pending: number;
}

/** Long enough that navigating between pages does not refetch on every click,
 *  short enough that a resumed or escalated job shows up without a reload. */
const STALE_MS = 60_000;

export function useNavCounts(enabled = true): NavCounts {
  const escalated = useQuery({
    queryKey: ['nav-count', 'escalated'],
    queryFn: () => ticketsService.getTickets({ escalated: '1', page_size: 1 }),
    enabled,
    staleTime: STALE_MS,
  });

  const pending = useQuery({
    queryKey: ['nav-count', 'pending'],
    queryFn: () => ticketsService.getTickets({ status: 'pending', page_size: 1 }),
    enabled,
    staleTime: STALE_MS,
  });

  return {
    escalated: escalated.data?.count ?? 0,
    pending: pending.data?.count ?? 0,
  };
}

export default useNavCounts;
