import { useQuery } from '@tanstack/react-query';
import { getOverview } from '@/lib/api/analytics';
import type { OverviewMetrics, OverviewResponse, StatusCount } from '@/types';

/** Shape expected by USER_PERSONAL_STATS in statCardsConfig.ts */
export interface UserPersonalData {
  /** ALL user's tickets by current status — preferred source for stat cards */
  live_status_distribution: StatusCount[];
  summary: {
    total: number;   // sum of live_status_distribution (or fallback)
    open: number;    // 'open' status count (unassigned), fallback open_backlog
    pending: number; // 'pending' status count
  };
  /** Windowed counts (created_at in window) — for charts/trends */
  status_distribution: StatusCount[];
  resolved: number;
  created: number;
}

function findLive(dist: StatusCount[], ...statuses: string[]): number {
  return dist.filter(s => statuses.includes(s.status)).reduce((sum, s) => sum + s.count, 0);
}

export function useUserDashboard() {
  const { data, isLoading, error, refetch } = useQuery<UserPersonalData>({
    queryKey: ['analytics', 'overview', 'user'],
    queryFn: async () => {
      const raw = await getOverview({});
      let overview: OverviewMetrics;
      let dist: StatusCount[];
      let liveDist: StatusCount[];

      if ('individual' in raw) {
        // Technician shape — use individual scope for personal stats
        overview = raw.individual;
        dist = raw.sectional.status_distribution;
        liveDist = [];
      } else {
        const typed = raw as OverviewResponse;
        overview = typed;
        dist = typed.status_distribution ?? [];
        liveDist = typed.live_status_distribution ?? [];
      }

      const liveTotal = liveDist.reduce((sum, s) => sum + s.count, 0);
      const distTotal = dist.reduce((sum, s) => sum + s.count, 0);
      // Prefer live total; fall back to windowed sum, then open_backlog + resolved
      const total = liveTotal > 0
        ? liveTotal
        : distTotal > 0
          ? distTotal
          : overview.open_backlog + overview.resolved;

      return {
        live_status_distribution: liveDist,
        summary: {
          total,
          open: findLive(liveDist, 'open') || overview.open_backlog,
          pending: findLive(liveDist, 'pending'),
        },
        status_distribution: dist,
        resolved: overview.resolved,
        created: overview.created,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  return { data: data ?? null, loading: isLoading, error, refetch };
}

export default useUserDashboard;
