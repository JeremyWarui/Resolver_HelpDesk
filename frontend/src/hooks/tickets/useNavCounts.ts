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
 * their section. Both counts narrow by `assigned_to` for a technician, because
 * both of their pages list only what they hold — a technician's server scope is
 * their whole (campus, trade) pool, so counting that would badge a number
 * neither page can show. The narrowing lives here rather than at the call sites
 * so a count and its page cannot drift apart.
 *
 * Shared query keys with the pages would be wrong here (different params), but
 * TanStack still dedupes these two across every consumer of the sidebar.
 */
import { useQuery } from '@tanstack/react-query';
import ticketsService from '@/lib/api/tickets';
import { useAuthStore } from '@/stores/authStore';
import { useRoleContext } from '@/lib/auth/roleContext';

export interface NavCounts {
  escalated: number;
  pending: number;
}

/** Long enough that navigating between pages does not refetch on every click,
 *  short enough that a resumed or escalated job shows up without a reload. */
const STALE_MS = 60_000;

export function useNavCounts(enabled = true): NavCounts {
  // The one exception to "server scope is the whole story": a technician's
  // Pending Work page lists only what is assigned to *them*, because that is
  // the only thing they may resume. Server scope for a technician is their
  // whole (campus, trade) pool, so counting it here would badge a number the
  // page cannot show. The narrowing lives here rather than at the call site so
  // the count and the page cannot drift apart.
  const { role } = useRoleContext();
  const userId = useAuthStore((s) => s.user?.id);
  const ownWorkOnly = role === 'technician';
  const escalatedParams = {
    escalated: '1' as const,
    page_size: 1,
    ...(ownWorkOnly && userId ? { assigned_to: userId } : {}),
  };
  const escalated = useQuery({
    queryKey: ['nav-count', 'escalated', escalatedParams],
    queryFn: () => ticketsService.getTickets(escalatedParams),
    enabled: enabled && !(ownWorkOnly && !userId),
    staleTime: STALE_MS,
  });

  const pendingParams = {
    status: 'pending' as const,
    page_size: 1,
    ...(ownWorkOnly && userId ? { assigned_to: userId } : {}),
  };
  const pending = useQuery({
    queryKey: ['nav-count', 'pending', pendingParams],
    queryFn: () => ticketsService.getTickets(pendingParams),
    enabled: enabled && !(ownWorkOnly && !userId),
    staleTime: STALE_MS,
  });

  return {
    escalated: escalated.data?.count ?? 0,
    pending: pending.data?.count ?? 0,
  };
}
