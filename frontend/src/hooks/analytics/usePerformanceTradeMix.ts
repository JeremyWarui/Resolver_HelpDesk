import { useQuery } from '@tanstack/react-query';
import { getPerformanceTradeMix } from '@/lib/api/analytics';
import type { AnalyticsParams, TradeMixResponse } from '@/types';

/**
 * Work mix per technician — the share of each person's jobs that is each trade.
 *
 * Refused server-side for technicians and requesters (403), so pass
 * `{ enabled }` from the caller's role rather than relying on the error.
 */
export function usePerformanceTradeMix(
  params?: AnalyticsParams,
  options?: { enabled?: boolean },
) {
  const { data, isLoading, error, refetch } = useQuery<TradeMixResponse>({
    queryKey: ['analytics', 'performance', 'trade-mix', params],
    queryFn: () => getPerformanceTradeMix(params),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export default usePerformanceTradeMix;
