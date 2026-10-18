import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import type { Technician } from '@/types';

/**
 * The technician roster for the caller's scope, optionally narrowed.
 *
 * GET /technicians/ derives scope from the JWT role and fails closed — admin
 * sees every campus, an HOS their own. `campus` and `trade` only narrow it.
 *
 * Both halves of the pair matter when picking an assignee: a Nairobi plumber
 * is no more an option for a Nairobi carpentry job than a Mombasa carpenter
 * is, and the server refuses the assignment either way.
 *
 * Includes idle technicians: a trade with nobody in it still routes work, and
 * that gap is worth seeing.
 */
export function useTechnicians(
  params?: { campus?: number | null; trade?: number | null },
  options?: { enabled?: boolean },
) {
  const campus = params?.campus ?? undefined;
  const trade = params?.trade ?? undefined;

  const query = useQuery<Technician[]>({
    queryKey: ['technicians', campus ?? null, trade ?? null],
    queryFn: async () => {
      const { data } = await apiClient.get('/technicians/', {
        params: { campus, trade },
      });
      return Array.isArray(data) ? data : (data.results ?? []);
    },
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });

  return {
    technicians: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
