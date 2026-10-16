// The reporting envelope, and the one derived view built on top of it.
//
// `useFacilityHealth` joins the asset register to the analytics breakdown, so
// it lives beside the hook it joins rather than in a directory of its own.

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getAnalytics, getDashboard, getOverview } from '@/lib/api/analytics';
import { useFacilities } from '@/hooks/useOrganizations';
import type { AnalyticsEnvelope, AnalyticsParams, DashboardEnvelope, DashboardParams, Facility, OverviewEnvelope, OverviewParams } from '@/types';

/** The reporting envelope for the signed-in user. `group_by` is checked server-side. */
export function useAnalytics(params?: AnalyticsParams, options?: { enabled?: boolean }) {
  const { data, isLoading, error, refetch } = useQuery<AnalyticsEnvelope>({
    queryKey: ['analytics', params],
    queryFn: () => getAnalytics(params),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

/** The manager's overview for a period, and optionally one campus. */
export function useOverview(params: OverviewParams) {
  const { data, isLoading, error } = useQuery<OverviewEnvelope>({
    queryKey: ['analytics', 'overview', params.days, params.bucket, params.campus ?? null],
    queryFn: () => getOverview(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error };
}

/** The manager's dashboard, refreshed every minute while it is open. A new
 *  chart period keeps the last figures on screen until its own arrive. */
export function useManagerDashboard(params: DashboardParams) {
  const { data, isLoading, error } = useQuery<DashboardEnvelope>({
    queryKey: ['analytics', 'dashboard', params],
    queryFn: () => getDashboard(params),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: keepPreviousData,
  });
  return { data: data ?? null, loading: isLoading, error };
}

interface FacilityTradeSlice {
  trade: string;
  total: number;
}

export interface FacilityHealthRow {
  id: number;
  name: string;
  campus: string;
  type: string;
  /** The register row itself, for the details sheet and the edit form. */
  facility: Facility;
  total: number;
  open: number;
  escalated: number;
  trades: FacilityTradeSlice[];
  /** Null on a tie as well as on silence: a leader drawn from a tie is a claim
   *  the data does not support. */
  topTrade: string | null;
}

/**
 * The asset register joined to the work raised against it, cut by trade.
 *
 * The register is the spine. A breakdown alone can only draw buildings that
 * have tickets, so the silent ones — either well kept or unreachable — would be
 * missing from the one view that should show them.
 *
 * Both the register page and the health table read this, so the summary cards
 * and the rows under them are the same numbers from the same request.
 */
export function useFacilityHealth(params?: AnalyticsParams) {
  const register = useFacilities();
  const facilities = register.facilities;
  const { data, loading } = useAnalytics({ ...params, group_by: 'facility,trade' });

  const rows = useMemo<FacilityHealthRow[]>(() => {
    type Figures = Pick<FacilityHealthRow, 'total' | 'open' | 'escalated' | 'trades'>;
    const byFacility = new Map<number, Figures>();
    for (const row of data?.breakdown ?? []) {
      const id = Number(row.key);
      const entry = byFacility.get(id) ?? { total: 0, open: 0, escalated: 0, trades: [] };
      entry.total += row.total;
      entry.open += row.open;
      entry.escalated += row.escalated;
      entry.trades.push({ trade: row.label_2 ?? '—', total: row.total });
      byFacility.set(id, entry);
    }

    return facilities
      .map((f) => {
        const figures = byFacility.get(f.id);
        const trades = [...(figures?.trades ?? [])].sort((a, b) => b.total - a.total);
        return {
          id: f.id,
          name: f.name,
          campus: f.campus_name,
          type: f.facility_type_name,
          facility: f,
          total: figures?.total ?? 0,
          open: figures?.open ?? 0,
          escalated: figures?.escalated ?? 0,
          trades,
          topTrade:
            trades.length && (trades.length === 1 || trades[0].total > trades[1].total)
              ? trades[0].trade
              : null,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [facilities, data]);

  return {
    rows,
    /** Re-read the register after a create or an edit. */
    refetch: register.refetch,
    loading: loading || register.loading,
  };
}
