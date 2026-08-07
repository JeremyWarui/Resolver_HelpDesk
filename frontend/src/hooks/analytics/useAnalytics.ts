import { useQuery } from '@tanstack/react-query';
import { getAnalytics } from '@/lib/api/analytics';
import type { AnalyticsEnvelope, AnalyticsParams } from '@/types';

/**
 * Unified analytics hook — one call to GET /api/v1/analytics/ returning the full
 * envelope ({scope, range, headline, series, breakdown, ticket_flow, insights}).
 * Scope is derived server-side from the JWT; `group_by` is validated against the
 * caller's role config (a technician can never request peer rankings).
 */
export function useAnalytics(
  params?: AnalyticsParams,
  options?: { enabled?: boolean },
) {
  const { data, isLoading, error, refetch } = useQuery<AnalyticsEnvelope>({
    queryKey: ['analytics', 'unified', params],
    queryFn: () => getAnalytics(params),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export default useAnalytics;
