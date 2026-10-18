// The catalogue a requester picks from, and the reference rows behind it.
//
// All three read `lib/api/catalogue.ts`: the trades with their service items,
// the facilities at a campus, and the FacilityType rows a form needs when it
// must send the FK rather than the code.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCatalog,
  getCampusFacilities,
  getTrades,
  getFacilityTypes,
  type CatalogTrade,
  type FacilityTypeRow,
} from '@/lib/api/catalogue';
import { rows } from '@/lib/api/client';
import type { Facility, Trade } from '@/types';

/** Every active trade, with its service items nested.
 *
 *  Takes no campus: all five trades run everywhere, so one cache entry serves
 *  every requester whatever campus they are based at. */
export function useCatalog() {
  return useQuery<CatalogTrade[]>({
    queryKey: ['catalog'],
    queryFn: getCatalog,
    staleTime: 5 * 60 * 1000,
  });
}

/** Every facility at a campus, in one call.
 *
 *  Small and stable, so the wizard groups it by type in the client and offers
 *  only the types the campus has something to pick from. */
export function useCampusFacilities(campusId: number | null | undefined) {
  return useQuery<Facility[]>({
    queryKey: ['campus-facilities', campusId],
    queryFn: () => getCampusFacilities(campusId!),
    enabled: campusId != null,
    staleTime: 10 * 60 * 1000,
  });
}

const TRADES_KEY = ['trades'] as const;

/** Every trade with its service items, including trades nobody is assigned to.
 *
 *  A trade with no technicians at a campus still routes tickets there. */
export function useTrades() {
  const queryClient = useQueryClient();
  const query = useQuery<Trade[]>({
    queryKey: TRADES_KEY,
    queryFn: async () => rows<Trade>((await getTrades()).data),
    staleTime: 5 * 60 * 1000,
  });

  return {
    trades: query.data ?? [],
    loading: query.isLoading,
    invalidate: () => queryClient.invalidateQueries({ queryKey: TRADES_KEY }),
  };
}

/** The FacilityType rows, for forms that must send the FK rather than the code.
 *  Fixed reference data — cached for the session. The codes themselves are
 *  enumerated in `constants/catalogue.ts`; these are the database rows. */
export function useFacilityTypes() {
  const { data, isLoading } = useQuery<FacilityTypeRow[]>({
    queryKey: ['facility-types'],
    queryFn: getFacilityTypes,
    staleTime: Infinity,
  });

  return { facilityTypes: data ?? [], loading: isLoading };
}
