// The org register: the campuses, and the facilities on them. Both are served
// by `lib/api/organizations.ts` and both are scoped server-side, so every role
// reads the same call and sees its own rows.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { campusesService, facilitiesService } from '@/lib/api/organizations';
import type { Campus, Facility } from '@/types';

const CAMPUSES_KEY = ['campuses'] as const;
const FACILITIES_KEY = ['facilities'] as const;

export const useCampuses = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<Campus[]>({
    queryKey: CAMPUSES_KEY,
    queryFn: () => campusesService.getCampuses(),
    staleTime: 10 * 60 * 1000,
  });

  return {
    campuses: data ?? [],
    loading: isLoading,
    refetch: () => queryClient.invalidateQueries({ queryKey: CAMPUSES_KEY }),
  };
};

/** The whole facility register. */
export const useFacilities = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<Facility[]>({
    queryKey: FACILITIES_KEY,
    queryFn: async () => {
      const response = await facilitiesService.getFacilities();
      return Array.isArray(response) ? response : (response as { results?: Facility[] }).results ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    facilities: data ?? [],
    loading: isLoading,
    refetch: () => queryClient.invalidateQueries({ queryKey: FACILITIES_KEY }),
  };
};
