import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import type { Technician } from '@/types';

/**
 * The technicians who may be given this ticket.
 *
 * Scoped by `(section, sub_section)` — the campus *and* the trade. Both halves
 * matter: a Nairobi plumber is not an option for a Nairobi carpentry job any
 * more than a Mombasa carpenter is. This is a hard boundary, not a preference
 * ordering — the server rejects an assignment outside the pair, so offering a
 * wider list here would only produce a 400 the HOS cannot act on.
 *
 * Uses GET /sections/{id}/assignable-technicians/?sub_section= — never the
 * global technician list.
 */
export function useSectionTechnicians(
  sectionId: number | null | undefined,
  subSectionId?: number | null,
) {
  return useQuery<Technician[]>({
    queryKey: ['sections', sectionId, 'assignable-technicians', subSectionId ?? null],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/sections/${sectionId}/assignable-technicians/`,
        subSectionId != null ? { params: { sub_section: subSectionId } } : undefined,
      );
      return Array.isArray(data) ? data : (data.results ?? []);
    },
    enabled: sectionId != null && sectionId > 0,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}
