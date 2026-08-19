import type { UseTicketTableResult } from '@/hooks/tickets/useTicketTable';
import * as FilterUtils from './FilterUtils';

/**
 * Configuration for which filters to include
 */
export interface FilterOptionsConfig {
  includeStatus?: boolean;
  includeTrade?: boolean;
}

/**
 * Generates standardized filter options for ticket tables.
 * Uses the consolidated useTicketTable hook state to create consistent filter UI.
 * 
 * @param table - Result from useTicketTable hook containing state and data
 * @param config - Configuration for which filters to include
 * @returns Array of FilterOption objects for DataTable component
 * 
 * Status and trade only. The technician and requester dropdowns used to live
 * here too, sourced from `table.technicians` / `table.users` — which came from
 * props no call site ever passed, so both were permanently empty. The pages
 * that need them (TicketsTable) build them inline from useTicketFilterOptions.
 */
export function createTicketTableFilters(
  table: UseTicketTableResult,
  config: FilterOptionsConfig = {}
) {
  const {
    includeStatus = true,
    includeTrade = true,
  } = config;

  const {
    statusFilter,
    setStatusFilter,
    tradeFilter,
    setTradeFilter,
    setPageIndex,
    trades,
    allStatuses,
  } = table;

  const filters = [];

  // Status filter
  if (includeStatus) {
    filters.push(
      FilterUtils.createStatusFilter(
        statusFilter,
        setStatusFilter,
        allStatuses,
        setPageIndex
      )
    );
  }

  // Trade filter
  if (includeTrade) {
    filters.push(
      FilterUtils.createTradeFilter(
        tradeFilter || 'all',
        (value) =>
          setTradeFilter(value === null ? null : typeof value === 'number' ? value : Number(value)),
        trades,
        setPageIndex
      )
    );
  }



  return filters;
}
