import { useQuery } from '@tanstack/react-query';
import { getHODAnalytics } from '@/lib/api/analytics';
import type { HODAnalytics, AnalyticsParams } from '@/types';

export function useHODDashboard(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<HODAnalytics>({
    queryKey: ['analytics', 'overview', 'hod', params],
    queryFn: () => getHODAnalytics(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export default useHODDashboard;
