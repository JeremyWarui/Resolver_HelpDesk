import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as catalogueService from '@/lib/api/catalogue';
import { getPriorities } from '@/lib/api/sla';
import { departmentsService, sectionsService } from '@/lib/api/organizations';
import type { ServiceCategory } from '@/types/catalogue';
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

  const priorities = useQuery({
    queryKey: ['priorities'],
    queryFn: getPriorities,
  });

  const categories = useQuery({
    queryKey: [...KEY, 'categories', activeTypeId],
    enabled: activeTypeId != null,
    queryFn: async () => {
      const res = await catalogueService.getAllCategories({ section_type: activeTypeId! });
      const raw = res.data;
      return Array.isArray(raw)
        ? (raw as ServiceCategory[])
        : ((raw as { results: ServiceCategory[] }).results ?? []);
    },
  });

  const structureError = sectionTypes.error || departments.error || priorities.error;
  useEffect(() => {
    if (structureError) toast.error('Failed to load catalogue');
  }, [structureError]);
  useEffect(() => {
    if (categories.error) toast.error('Failed to load categories');
  }, [categories.error]);

  return {
    sectionTypes: sectionTypes.data ?? [],
    departments: departments.data ?? [],
    priorities: priorities.data ?? [],
    categories: categories.data ?? [],
    loading: sectionTypes.isLoading || departments.isLoading || priorities.isLoading,
    catsLoading: categories.isLoading,
    /** After creating/renaming/deleting a section type. */
    invalidateStructure: () =>
      queryClient.invalidateQueries({ queryKey: [...KEY, 'section-types'] }),
    /** After any category/item write. */
    invalidateCategories: () =>
      queryClient.invalidateQueries({ queryKey: [...KEY, 'categories'] }),
  };
}
