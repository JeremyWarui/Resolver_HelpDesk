import { useQuery } from '@tanstack/react-query';
import { getManagerAnalytics } from '@/lib/api/analytics';
import type { ManagerAnalytics, AnalyticsParams } from '@/types';

export function useManagerDashboard(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<ManagerAnalytics>({
    queryKey: ['analytics', 'overview', 'manager', params],
    queryFn: () => getManagerAnalytics(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export default useManagerDashboard;
