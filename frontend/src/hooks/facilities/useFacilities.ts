import { useQuery, useQueryClient } from '@tanstack/react-query';
import { facilitiesService } from '@/lib/api/organizations';
import type { Facility } from '@/types';

export const FACILITIES_KEY = ['facilities'] as const;

export const useFacilities = (campusId?: number) => {
  const queryClient = useQueryClient();
  const { data: raw, isLoading, error } = useQuery<Facility[]>({
    queryKey: campusId ? [...FACILITIES_KEY, campusId] : FACILITIES_KEY,
    queryFn: async () => {
      const response = await facilitiesService.getFacilities(campusId ? { campus: campusId } : undefined);
      return Array.isArray(response) ? response : (response as { results?: Facility[] }).results ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: FACILITIES_KEY });

  return {
    data: raw ?? [],
    facilities: raw ?? [],
    isLoading,
    loading: isLoading,
    error: error as Error | null,
    refetch,
  };
};

export default useFacilities;
