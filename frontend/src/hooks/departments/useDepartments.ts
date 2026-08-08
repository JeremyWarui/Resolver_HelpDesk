import { useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsService } from '@/lib/api';
import type { Department } from '@/types/organisationStructure';

export const DEPARTMENTS_KEY = ['departments'] as const;

/**
 * Departments, optionally narrowed to one campus.
 *
 * There were two hooks of this name: this one, and a hand-rolled
 * useState/useEffect fetcher under `hooks/useDepartments.ts` with a different
 * return shape (`{ data, isLoading }` vs `{ departments, loading }`) and its
 * own eslint-disable for the set-state-in-effect it caused. Server state in a
 * hand-rolled container is the same mistake the notification store made — no
 * caching, no dedup, no shared invalidation. This is the survivor.
 */
export const useDepartments = (campusId?: number) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<Department[]>({
    queryKey: [...DEPARTMENTS_KEY, campusId ?? null],
    queryFn: () =>
      departmentsService.getDepartments(campusId != null ? { campus: campusId } : undefined),
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
