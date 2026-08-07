import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TicketFilters } from '@/types';

interface UseTicketFiltersResult {
  filters: TicketFilters;
  setFilter: (key: keyof TicketFilters, value: string | number | boolean | undefined) => void;
  setFilters: (updates: Partial<TicketFilters>) => void;
  clearFilters: () => void;
}

// Syncs ticket filter state to URL search params so filters survive navigation
// and can be shared via URL.
export function useTicketFilters(): UseTicketFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: TicketFilters = {
    status: searchParams.get('status') ?? undefined,
    priority: searchParams.get('priority') ?? undefined,
    assigneeId: searchParams.get('assigneeId') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo: searchParams.get('dateTo') ?? undefined,
    overdue: searchParams.get('overdue') === 'true' ? true : undefined,
    page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
    pageSize: searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined,
  };

  const setFilter = useCallback(
    (key: keyof TicketFilters, value: string | number | boolean | undefined) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (value === undefined || value === '') {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
        // Reset to page 1 when any non-pagination filter changes
        if (key !== 'page') {
          next.delete('page');
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const setFilters = useCallback(
    (updates: Partial<TicketFilters>) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        const hasPaginationKey = 'page' in updates;
        Object.entries(updates).forEach(([k, v]) => {
          if (v === undefined || v === '') {
            next.delete(k);
          } else {
            next.set(k, String(v));
          }
        });
        if (!hasPaginationKey) {
          next.delete('page');
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return { filters, setFilter, setFilters, clearFilters };
}
