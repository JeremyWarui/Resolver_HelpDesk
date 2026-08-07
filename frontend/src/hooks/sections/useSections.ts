import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sectionsService } from '@/lib/api/organizations';
import type { Section } from '@/types';

export const SECTIONS_KEY = ['sections'] as const;

export const useSections = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<Section[]>({
    queryKey: SECTIONS_KEY,
    queryFn: () => sectionsService.getSections(),
    staleTime: 5 * 60 * 1000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: SECTIONS_KEY });

  return {
    sections: data ?? [],
    totalSections: data?.length ?? 0,
    loading: isLoading,
    error: error as Error | null,
    refetch,
  };
};

export default useSections;
