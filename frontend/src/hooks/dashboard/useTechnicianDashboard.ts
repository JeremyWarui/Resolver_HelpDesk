import { useQuery } from '@tanstack/react-query';
import { getOverview } from '@/lib/api/analytics';
import type { TechnicianOverviewResponse, AnalyticsParams } from '@/types';

export function useTechnicianDashboard(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<TechnicianOverviewResponse>({
    queryKey: ['analytics', 'overview', 'technician', params],
    queryFn: () => getOverview(params) as Promise<TechnicianOverviewResponse>,
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export default useTechnicianDashboard;
