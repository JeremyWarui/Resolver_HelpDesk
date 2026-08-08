import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as catalogueService from '@/lib/api/catalogue';
import { departmentsService, sectionsService } from '@/lib/api/organizations';
import type { SubSection } from '@/types/catalogue';
import type { SectionType } from './types';

const KEY = ['catalogue'] as const;

/** All server data for the catalogue admin page, cached by react-query.
 * Forms/deletes call the invalidate helpers after a write — the queries
 * refetch themselves; no manual refresh choreography. */
export function useCatalogueData(activeTypeId: number | null) {
  const queryClient = useQueryClient();

  const sectionTypes = useQuery({
    queryKey: [...KEY, 'section-types'],
    queryFn: async () =>
      (await sectionsService.getSectionTypes()) as unknown as SectionType[],
  });

  const departments = useQuery({
    queryKey: [...KEY, 'departments'],
    queryFn: () => departmentsService.getDepartments(),
  });

  const subSections = useQuery({
    queryKey: [...KEY, 'sub-sections', activeTypeId],
    enabled: activeTypeId != null,
    queryFn: async () => {
      const res = await catalogueService.getSubSections({ section_type: activeTypeId! });
      const raw = res.data;
      return Array.isArray(raw)
        ? (raw as SubSection[])
        : ((raw as { results: SubSection[] }).results ?? []);
    },
  });

  const structureError = sectionTypes.error || departments.error;
  useEffect(() => {
    if (structureError) toast.error('Failed to load catalogue');
  }, [structureError]);
  useEffect(() => {
    if (subSections.error) toast.error('Failed to load trades');
  }, [subSections.error]);

  return {
    sectionTypes: sectionTypes.data ?? [],
    departments: departments.data ?? [],
    subSections: subSections.data ?? [],
    loading: sectionTypes.isLoading || departments.isLoading,
    subsLoading: subSections.isLoading,
    /** After creating/renaming/deleting a section type. */
    invalidateStructure: () =>
      queryClient.invalidateQueries({ queryKey: [...KEY, 'section-types'] }),
    /** After any trade/item write. */
    invalidateSubSections: () =>
      queryClient.invalidateQueries({ queryKey: [...KEY, 'sub-sections'] }),
  };
}
