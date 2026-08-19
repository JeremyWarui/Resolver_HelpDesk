import { useQuery } from '@tanstack/react-query';
import { getFacilityTypes, type FacilityTypeRow } from '@/lib/api/catalogue';

/** The FacilityType rows, for forms that must send the FK rather than the code.
 *  Fixed reference data — cached for the session. */
export function useFacilityTypes() {
  const { data, isLoading } = useQuery<FacilityTypeRow[]>({
    queryKey: ['facility-types'],
    queryFn: getFacilityTypes,
    staleTime: Infinity,
  });

  return { facilityTypes: data ?? [], loading: isLoading };
}
