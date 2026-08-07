import { useQuery } from '@tanstack/react-query';
import type { AnalyticsParams } from '@/types';

export function useRoleAnalytics<T>(
  fetcher: (params?: AnalyticsParams) => Promise<T>,
  params?: AnalyticsParams,
  skip = false
) {
  const { data, isLoading, error, refetch } = useQuery<T>({
    queryKey: ['analytics', 'role', fetcher.name, params],
    queryFn: () => fetcher(params),
    enabled: !skip,
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}
