import { useQuery } from '@tanstack/react-query';
import { getSectionHeadAnalytics } from '@/lib/api/analytics';
import type { SectionHeadAnalytics, AnalyticsParams } from '@/types';

export function useSectionHeadDashboard(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<SectionHeadAnalytics>({
    queryKey: ['analytics', 'overview', 'hos', params],
    queryFn: () => getSectionHeadAnalytics(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export default useSectionHeadDashboard;
