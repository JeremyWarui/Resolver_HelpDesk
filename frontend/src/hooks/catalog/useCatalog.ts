import { useQuery } from '@tanstack/react-query';
import {
  getCatalog,
  getCampusFacilities,
  type CampusFacility,
  type CatalogSubSection,
} from '@/lib/api/catalogue';

/** The trades a campus runs, with their service items nested. */
export function useCatalog(campusId: number | null | undefined) {
  return useQuery<CatalogSubSection[]>({
    queryKey: ['catalog', campusId],
    queryFn: () => getCatalog(campusId!),
    enabled: campusId != null,
    staleTime: 5 * 60 * 1000,
  });
}

/** Every facility at a campus, in one call.
 *
 * Small and stable — the largest campus has eighteen — so fetching the lot
 * and grouping by `type` client-side beats a request per facility type the
 * requester happens to click on. It also means the wizard only offers types
 * the campus actually has something to pick from.
 */
export function useCampusFacilities(campusId: number | null | undefined) {
  return useQuery<CampusFacility[]>({
    queryKey: ['campus-facilities', campusId],
    queryFn: () => getCampusFacilities(campusId!),
    enabled: campusId != null,
    staleTime: 10 * 60 * 1000,
  });
}
