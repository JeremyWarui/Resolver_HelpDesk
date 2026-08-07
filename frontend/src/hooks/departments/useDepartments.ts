import { useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsService } from '@/lib/api';
import type { Department } from '@/types/organisationStructure';

export const DEPARTMENTS_KEY = ['departments'] as const;

export const useDepartments = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<Department[]>({
    queryKey: DEPARTMENTS_KEY,
    queryFn: () => departmentsService.getDepartments(),
    staleTime: 10 * 60 * 1000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY });

  return {
    departments: data ?? [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
};

export default useDepartments;
