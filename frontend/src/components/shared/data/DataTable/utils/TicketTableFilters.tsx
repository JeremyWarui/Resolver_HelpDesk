import type { UseTicketTableResult } from '@/hooks/tickets/useTicketTable';
import * as FilterUtils from './FilterUtils';

/**
 * Configuration for which filters to include
 */
export interface FilterOptionsConfig {
  includeStatus?: boolean;
  includeTrade?: boolean;
  includeTechnician?: boolean;
  includeUser?: boolean;
}

/**
 * Generates standardized filter options for ticket tables.
 * Uses the consolidated useTicketTable hook state to create consistent filter UI.
 * 
 * @param table - Result from useTicketTable hook containing state and data
 * @param config - Configuration for which filters to include
 * @returns Array of FilterOption objects for DataTable component
 * 
 * @example
 * const table = useTicketTable({ role: 'admin', fetchTechnicians: true, fetchUsers: true });
 * const filters = createTicketTableFilters(table, {
 *   includeStatus: true,
 *   includeTrade: true,
 *   includeTechnician: true,
 *   includeUser: true
 * });
 */
export function createTicketTableFilters(
  table: UseTicketTableResult,
  config: FilterOptionsConfig = {}
) {
  const {
    includeStatus = true,
    includeTrade = true,
    includeTechnician = false,
    includeUser = false,
  } = config;

  const {
    statusFilter,
    setStatusFilter,
    tradeFilter,
    setTradeFilter,
    technicianFilter,
    setTechnicianFilter,
    userFilter,
    setUserFilter,
    setPageIndex,
    trades,
    technicians,
    users,
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

  // Technician filter
  if (includeTechnician) {
    filters.push(
      FilterUtils.createTechnicianFilter(
        String(technicianFilter || 'all'),
        (value) => setTechnicianFilter(value === 'all' ? null : Number(value)),
        technicians.map((t) => ({
          id: t.id,
          name: `${t.first_name} ${t.last_name}`,
        })),
        undefined,
        setPageIndex
      )
    );
  }

  // User filter (Raised By)
  if (includeUser) {
    filters.push(
      FilterUtils.createUserFilter(
        String(userFilter || 'all'),
        (value) => setUserFilter(value === 'all' ? null : Number(value)),
        users.map((u) => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
        })),
        setPageIndex
      )
    );
  }

  return filters;
}
