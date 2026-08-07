import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import type { Technician } from '@/types';

export const SCOPED_TECHNICIANS_KEY = ['scoped-technicians'] as const;

/**
 * Technician roster for the caller's scope.
 *
 * Calls GET /technicians/ (ScopedTechnicianRosterView) which returns the
 * technicians assigned (via SectionTechnician) to the sections the caller
 * manages — admin = all, manager = department, hod = campus-department,
 * hos = their section(s). Scope is derived server-side from the JWT role
 * (fail-closed); never pass scope params from the client.
 *
 * Unlike the ticket-derived analytics workload list, this includes idle
 * technicians (section-assigned but with no current tickets).
 */
export function useScopedTechnicians() {
  const query = useQuery<Technician[]>({
    queryKey: SCOPED_TECHNICIANS_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get('/technicians/');
      return Array.isArray(data) ? data : (data.results ?? []);
    },
    staleTime: 2 * 60 * 1000,
  });

  return {
    technicians: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useScopedTechnicians;
