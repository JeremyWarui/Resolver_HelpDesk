import { useQuery, useQueryClient } from '@tanstack/react-query';
import { campusesService } from '@/lib/api';
import type { Campus } from '@/types/organisationStructure';

export const CAMPUSES_KEY = ['campuses'] as const;

export const useCampuses = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<Campus[]>({
    queryKey: CAMPUSES_KEY,
    queryFn: () => campusesService.getCampuses(),
    staleTime: 10 * 60 * 1000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: CAMPUSES_KEY });

  return {
    campuses: data ?? [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
};

export default useCampuses;
