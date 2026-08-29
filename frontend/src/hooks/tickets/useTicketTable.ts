import { useState, useMemo, useCallback } from 'react';
import { useTickets } from './useTickets';
import { useTicketFilterOptions } from '@/hooks/tickets/useTickets';
import type { Ticket, TicketsParams } from '@/types';
import { ALL_TICKET_STATUSES } from '@/constants/tickets';

export interface UseTicketTableConfig {
  currentUserId?: number;
  defaultStatusFilter?: string;
  defaultPageSize?: number;
  skipUntilUserId?: boolean;
  /** Server params pinned for the page's purpose (e.g. assigned_to on the
   *  Assigned Tickets page) — applied last, not clearable via filter UI. */
  fixedParams?: Partial<TicketsParams>;
}

export interface UseTicketTableResult {
  // Pagination
  pageIndex: number;
  pageSize: number;
  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;

  // Filter State
  statusFilter: string;
  tradeFilter: number | null;
  technicianFilter: number | null;
  userFilter: number | null;
  setStatusFilter: (status: string) => void;
  setTradeFilter: (trade: number | null) => void;
  setTechnicianFilter: (technician: number | null) => void;
  setUserFilter: (user: number | null) => void;
  setOverdueFilter: (overdue: boolean) => void;

  /** Which row is highlighted, and the handler that sets it. */
  selectedTicket: Ticket | null;
  setSelectedTicket: (ticket: Ticket | null) => void;

  // Data
  tickets: Ticket[];
  totalTickets: number;
  /** Trades in the caller's scope — the ticket-table filter's options. */
  trades: Array<{ id: number; name: string }>;

  loading: boolean;

  // Actions
  handleViewTicket: (ticket: Ticket) => void;

  // Constants
  allStatuses: string[];
}

export const useTicketTable = (config: UseTicketTableConfig): UseTicketTableResult => {
  const {
    currentUserId,
    defaultStatusFilter = 'all',
    defaultPageSize = 10,
    skipUntilUserId = false,
    fixedParams,
  } = config;

  // ==================== STATE ====================
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);

  // 0-based page index (react-table convention); sent to the API as page = pageIndex + 1.
  // /tickets/ uses DRF PageNumberPagination (TicketFeedPagination) — the feed is ordered
  // -updated_at, a mutable sort key, which rules out cursor pagination by design.
  const [pageIndex, setPageIndexRaw] = useState(0);

  // Filter state. These are server params — they narrow an already
  // role-scoped queryset, they do not widen it, so an id outside the caller's
  // scope simply matches nothing.
  const [statusFilter, setStatusFilterRaw] = useState<string>(defaultStatusFilter);
  const [tradeFilter, setTradeFilterRaw] = useState<number | null>(null);
  const [technicianFilter, setTechnicianFilterRaw] = useState<number | null>(null);
  const [userFilter, setUserFilterRaw] = useState<number | null>(null);
  const [overdueFilter, setOverdueFilterRaw] = useState<boolean>(false);

  // Any server-side filter change must restart pagination at page 1.
  const resetToFirstPage = useCallback(() => {
    setPageIndexRaw(0);
  }, []);

  const setStatusFilter = useCallback((status: string) => {
    setStatusFilterRaw(status);
    resetToFirstPage();
  }, [resetToFirstPage]);

  const setTradeFilter = useCallback((trade: number | null) => {
    setTradeFilterRaw(trade);
    resetToFirstPage();
  }, [resetToFirstPage]);

  const setTechnicianFilter = useCallback((technician: number | null) => {
    setTechnicianFilterRaw(technician);
    resetToFirstPage();
  }, [resetToFirstPage]);

  const setUserFilter = useCallback((user: number | null) => {
    setUserFilterRaw(user);
    resetToFirstPage();
  }, [resetToFirstPage]);

  const setOverdueFilter = useCallback((overdue: boolean) => {
    setOverdueFilterRaw(overdue);
    resetToFirstPage();
  }, [resetToFirstPage]);

  // Which row is highlighted, read back as DataTable's `selectedRowId`.
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // ==================== DATA FETCHING ====================
  const ticketParams = useMemo((): TicketsParams => ({
    page: pageIndex + 1,
    page_size: pageSize,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(tradeFilter ? { trade: tradeFilter } : {}),
    ...(technicianFilter ? { assigned_to: technicianFilter } : {}),
    ...(userFilter ? { raised_by: userFilter } : {}),
    // Server-side, like every other filter here: the table is paginated, so
    // narrowing the page the client holds would filter 20 rows and call it
    // the answer.
    ...(overdueFilter ? { overdue: '1' as const } : {}),
    ...(fixedParams ?? {}),
  }), [pageIndex, pageSize, statusFilter, tradeFilter, technicianFilter, userFilter, overdueFilter, fixedParams]);

  const { tickets, totalTickets, loading } = useTickets(
    ticketParams,
    skipUntilUserId && currentUserId === undefined,
  );

  const { trades } = useTicketFilterOptions();

  // ==================== HANDLERS ====================
  // The rows themselves are mapped in `TicketTable`, which adds the hidden
  // `searchField` every consumer of this hook renders through.
  const handleViewTicket = useCallback((ticket: Ticket) => {
    setSelectedTicket(ticket);
  }, []);

  const setPageIndex = useCallback((index: number) => {
    setPageIndexRaw(index);
  }, []);

  // Resizing restarts the listing: page 4 of 10-row pages is off the end of
  // the same list cut into 50s.
  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setPageIndexRaw(0);
  }, []);

  // ==================== RETURN ====================
  return {
    pageIndex,
    pageSize,
    setPageIndex,
    setPageSize,

    statusFilter,
    tradeFilter,
    technicianFilter,
    userFilter,
    setStatusFilter,
    setTradeFilter,
    setTechnicianFilter,
    setUserFilter,
    setOverdueFilter,

    selectedTicket,
    setSelectedTicket,

    tickets,
    totalTickets,
    trades,
    loading,

    handleViewTicket,

    allStatuses: ALL_TICKET_STATUSES,
  };
};
