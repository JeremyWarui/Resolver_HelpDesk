import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

/** One `SectionTechnician` row — a technician pinned to a (section, trade) pair. */
export interface SectionTechnicianLink {
  id: number;
  user: number;
  section: number;
  sub_section: number;
  sub_section_name: string;
  added_at: string;
}

/**
 * The (section, trade) pairs for one section.
 *
 * This is the only honest source for "who works this trade here". The
 * technician roster carries flat `sections[]` and `sub_sections[]` arrays,
 * and crossing them re-creates precisely the bug `scoped_ticket_qs` is
 * written to avoid: a technician who is Carpentry@Nairobi and
 * Plumbing@Mombasa would appear as a Nairobi plumber. The link rows keep the
 * pairing intact.
 */
export function useSectionTechnicianLinks(sectionId: number | null | undefined) {
  const query = useQuery<SectionTechnicianLink[]>({
    queryKey: ['sections', sectionId, 'technician-links'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/sections/${sectionId}/technicians/`);
      return Array.isArray(data) ? data : (data.results ?? []);
    },
    enabled: sectionId != null && sectionId > 0,
    staleTime: 2 * 60 * 1000,
  });

  return {
    links: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
