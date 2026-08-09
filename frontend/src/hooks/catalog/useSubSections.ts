import { useQuery } from '@tanstack/react-query';
import { getSubSections } from '@/lib/api/catalogue';
import type { SubSection } from '@/types/catalogue';

export const SUB_SECTIONS_KEY = ['sub-sections'] as const;

/**
 * Every trade, including ones nobody is assigned to.
 *
 * Deriving the trade list from the technician roster would be cheaper but would
 * hide exactly the thing worth seeing: a trade with no technicians at a campus
 * still routes tickets, they just have nobody to go to.
 */
export function useSubSections() {
  const query = useQuery<SubSection[]>({
    queryKey: SUB_SECTIONS_KEY,
    queryFn: async () => {
      const { data } = await getSubSections();
      return Array.isArray(data) ? data : ((data as { results?: SubSection[] }).results ?? []);
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    subSections: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useSubSections;
