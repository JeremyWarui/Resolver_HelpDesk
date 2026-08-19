import { useQuery } from '@tanstack/react-query';
import { getPerformanceFacilities } from '@/lib/api/analytics';
import type { AnalyticsParams, FacilityMixResponse } from '@/types';

/** Tickets per facility with the trade split. 403s for technicians and requesters. */
export function usePerformanceFacilities(
  params?: AnalyticsParams,
  options?: { enabled?: boolean },
) {
  const { data, isLoading, error, refetch } = useQuery<FacilityMixResponse>({
    queryKey: ['analytics', 'performance', 'facilities', params],
    queryFn: () => getPerformanceFacilities(params),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}
