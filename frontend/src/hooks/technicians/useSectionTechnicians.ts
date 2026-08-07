import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import type { Technician } from '@/types';

/**
 * Load the technician pool for a specific section.
 * Uses GET /sections/{id}/technicians/ — returns only technicians in that section.
 * This is the correct endpoint for assignment; do NOT use the global technician list.
 */
export function useSectionTechnicians(sectionId: number | null | undefined) {
  return useQuery<Technician[]>({
    queryKey: ['sections', sectionId, 'assignable-technicians'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/sections/${sectionId}/assignable-technicians/`);
      return Array.isArray(data) ? data : (data.results ?? []);
    },
    enabled: sectionId != null && sectionId > 0,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export default useSectionTechnicians;
