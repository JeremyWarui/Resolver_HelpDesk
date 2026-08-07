import { useQuery } from '@tanstack/react-query';
import { getOverview } from '@/lib/api/analytics';
import type { OverviewResponse, AnalyticsParams } from '@/types';

export function useAdminDashboard(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<OverviewResponse>({
    queryKey: ['analytics', 'overview', 'admin', params],
    queryFn: () => getOverview(params) as Promise<OverviewResponse>,
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}
