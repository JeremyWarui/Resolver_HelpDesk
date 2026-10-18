import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPriorities, updatePriority } from '@/lib/api/sla';
import type { Priority } from '@/types';

const PRIORITIES_KEY = ['priorities'];

/** The four priorities and their targets, cached once for every screen that reads them. */
export function usePriorities(options?: { enabled?: boolean }) {
  const { data, isLoading, error } = useQuery({
    queryKey: PRIORITIES_KEY,
    queryFn: getPriorities,
    staleTime: 30 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
  return { priorities: data ?? [], loading: isLoading, error };
}

/** Change one priority's target, and put the saved row in the cache. */
export function useUpdatePriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<Omit<Priority, 'id' | 'rank'>> }) =>
      updatePriority(id, changes),
    onSuccess: (saved) =>
      queryClient.setQueryData<Priority[]>(PRIORITIES_KEY, (rows) => rows?.map((p) => (p.id === saved.id ? saved : p))),
  });
}
