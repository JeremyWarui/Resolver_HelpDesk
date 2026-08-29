import type { FilterOption } from '../DataTable';
import type { UseTicketTableResult } from '@/hooks/tickets/useTicketTable';
import { useTicketFilterOptions } from '@/hooks/tickets/useTickets';
import * as FilterUtils from './FilterUtils';

/** Which of the four dropdowns a page wants. Status and trade are on by
 *  default because every ticket table has them; the two people filters are
 *  opt-in, since a technician's own queue would list only themselves. */
interface FilterOptionsConfig {
  includeStatus?: boolean;
  includeTrade?: boolean;
  includeTechnician?: boolean;
  includeRequester?: boolean;
  /** Take over the status dropdown, for a page that pairs it with pills and
   *  has to keep the two in step. Defaults to `table.setStatusFilter`. */
  onStatusChange?: (status: string) => void;
}

/**
 * The ticket table's filter dropdowns, wired to `useTicketTable`'s server-side
 * filter state.
 *
 * A hook rather than a plain factory: the technician and requester lists come
 * from `/tickets/filter-options/`, so a page asking for those dropdowns should
 * not also have to remember to fetch what fills them. Every option list is
 * built server-side from the caller's own rows, so no dropdown can offer an id
 * whose tickets the caller would be refused.
 */
export function useTicketTableFilters(
  table: UseTicketTableResult,
  config: FilterOptionsConfig = {},
): FilterOption[] {
  const {
    includeStatus = true,
    includeTrade = true,
    includeTechnician = false,
    includeRequester = false,
    onStatusChange,
  } = config;

  const { technicians, requesters } = useTicketFilterOptions();

  const filters: FilterOption[] = [];

  if (includeStatus) {
    filters.push(
      FilterUtils.createStatusFilter(
        table.statusFilter,
        onStatusChange ?? table.setStatusFilter,
        table.allStatuses,
        table.setPageIndex,
      ),
    );
  }

  if (includeTrade) {
    filters.push(
      FilterUtils.createTradeFilter(
        table.tradeFilter ?? 'all',
        table.setTradeFilter,
        table.trades,
        table.setPageIndex,
      ),
    );
  }

  if (includeTechnician) {
    filters.push(
      FilterUtils.createTechnicianFilter(
        String(table.technicianFilter ?? 'all'),
        (value) => table.setTechnicianFilter(value === 'all' ? null : Number(value)),
        technicians,
        table.setPageIndex,
      ),
    );
  }

  if (includeRequester) {
    filters.push(
      FilterUtils.createUserFilter(
        String(table.userFilter ?? 'all'),
        (value) => table.setUserFilter(value === 'all' ? null : Number(value)),
        requesters,
        table.setPageIndex,
      ),
    );
  }

  return filters;
}
