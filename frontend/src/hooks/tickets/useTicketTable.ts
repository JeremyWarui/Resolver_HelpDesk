import { useState, useMemo, useCallback, useEffect } from 'react';
import useTickets from './useTickets';
import useUpdateTicket from './useUpdateTicket';
import { useSections } from '@/hooks/sections/useSections';
import { useFacilities } from '@/hooks/facilities/useFacilities';
import { extractWritableFields } from '@/utils/ticketHelpers';
import { formatSectionDisplay } from '@/utils/formatSection';
import type { Ticket, Section, Facility, Technician, User, TicketsParams } from '@/types';

export interface UseTicketTableConfig {
  role: 'admin' | 'user' | 'technician' | 'hos' | 'hod' | 'manager';
  currentUserId?: number;
  defaultStatusFilter?: string;
  defaultPageSize?: number;
  fetchSectionTickets?: boolean;
  skipUntilUserId?: boolean;
  /** Server params pinned for the page's purpose (e.g. assigned_to on the
   *  Assigned Tickets page) — applied last, not clearable via filter UI. */
  fixedParams?: Partial<TicketsParams>;
  externalSections?: Section[];
  externalUsers?: User[];
  externalTechnicians?: Technician[];
  externalFacilities?: Facility[];
  initialData?: Ticket[];
  onDataFetched?: (tickets: Ticket[], total: number) => void;
}

export interface UseTicketTableResult {
  // Pagination
  pageIndex: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;

  // Filter State
  statusFilter: string;
  sectionFilter: number | null;
  technicianFilter: number | null;
  userFilter: number | null;
  unassignedFilter: boolean;
  overdueFilter: boolean;
  setStatusFilter: (status: string) => void;
  setSectionFilter: (section: number | null) => void;
  setTechnicianFilter: (technician: number | null) => void;
  setUserFilter: (user: number | null) => void;
  setUnassignedFilter: (unassigned: boolean) => void;
  setOverdueFilter: (overdue: boolean) => void;

  // Dialog State
  selectedTicket: Ticket | null;
  isTicketDialogOpen: boolean;
  setSelectedTicket: (ticket: Ticket | null) => void;
  setIsTicketDialogOpen: (open: boolean) => void;

  // Data
  tickets: Ticket[];
  totalTickets: number;
  sections: Section[];
  facilities: Facility[];
  technicians: Technician[];
  users: User[];
  tableData: Ticket[];

  // Loading States
  loading: boolean;
  ticketsLoading: boolean;
  techniciansLoading: boolean;
  usersLoading: boolean;
  facilitiesLoading: boolean;

  // Actions
  handleViewTicket: (ticket: Ticket) => void;
  handleTicketUpdate: (updatedTicket: Ticket) => Promise<Ticket | undefined>;
  handlePageChange: (newPageIndex: number) => void;
  handlePageSizeChange: (newPageSize: number) => void;
  updateTicket: (ticket: Ticket) => Promise<Ticket>;
  refetch: () => void;

  // Constants
  allStatuses: string[];
  commonTableProps: {
    searchPlaceholder: string;
    emptyStateMessage: string;
    emptyStateDescription: string;
    defaultSorting: { id: string; desc: boolean }[];
    manualPagination: boolean;
  };
}

const ALL_TICKET_STATUSES = [
  'open', 'assigned', 'in_progress', 'pending',
  'resolved', 'closed',
];

const COMMON_TABLE_PROPS = {
  searchPlaceholder: 'Search by ID or title...',
  emptyStateMessage: 'No tickets found',
  emptyStateDescription: 'Try changing your filters or check back later',
  defaultSorting: [{ id: 'updated_at', desc: true }],
  manualPagination: true,
};

export const useTicketTable = (config: UseTicketTableConfig): UseTicketTableResult => {
  const {
    currentUserId,
    defaultStatusFilter = 'all',
    defaultPageSize = 10,
    skipUntilUserId = false,
    externalSections,
    externalUsers,
    externalTechnicians,
    externalFacilities,
    initialData,
    onDataFetched,
    fixedParams,
  } = config;

  // ==================== STATE ====================
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);

  // 0-based page index (react-table convention); sent to the API as page = pageIndex + 1.
  // /tickets/ uses DRF PageNumberPagination (TicketFeedPagination) — the feed is ordered
  // -updated_at, a mutable sort key, which rules out cursor pagination by design.
  const [pageIndex, setPageIndexRaw] = useState(0);

  // Filter state (section/technician/user/overdue filters are kept as UI state;
  // the backend scopes results by JWT role, not by these query params)
  const [statusFilter, setStatusFilterRaw] = useState<string>(defaultStatusFilter);
  const [sectionFilter, setSectionFilterRaw] = useState<number | null>(null);
  const [technicianFilter, setTechnicianFilterRaw] = useState<number | null>(null);
  const [userFilter, setUserFilterRaw] = useState<number | null>(null);
  const [unassignedFilter, setUnassignedFilter] = useState<boolean>(false);
  const [overdueFilter, setOverdueFilter] = useState<boolean>(false);

  // Any server-side filter change must restart pagination at page 1.
  const resetToFirstPage = useCallback(() => {
    setPageIndexRaw(0);
  }, []);

  const setStatusFilter = useCallback((status: string) => {
    setStatusFilterRaw(status);
    resetToFirstPage();
  }, [resetToFirstPage]);

  const setSectionFilter = useCallback((section: number | null) => {
    setSectionFilterRaw(section);
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

  // Dialog state
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);

  // ==================== DATA FETCHING ====================
  const ticketParams = useMemo((): TicketsParams => ({
    page: pageIndex + 1,
    page_size: pageSize,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(sectionFilter ? { section: sectionFilter } : {}),
    ...(technicianFilter ? { assigned_to: technicianFilter } : {}),
    ...(userFilter ? { raised_by: userFilter } : {}),
    ...(fixedParams ?? {}),
  }), [pageIndex, pageSize, statusFilter, sectionFilter, technicianFilter, userFilter, fixedParams]);

  const skipInitialFetch = initialData != null && pageIndex === 0;

  const {
    tickets: fetchedTickets,
    totalTickets: fetchedTotalTickets,
    nextPage,
    prevPage,
    loading: ticketsLoading,
    refetch,
  } = useTickets(
    ticketParams,
    skipUntilUserId && currentUserId === undefined,
  );

  const hasNextPage = !!nextPage;
  const hasPrevPage = !!prevPage;

  const tickets = useMemo(
    () => (skipInitialFetch ? (initialData ?? []) : fetchedTickets),
    [skipInitialFetch, initialData, fetchedTickets],
  );
  const totalTickets = skipInitialFetch ? (initialData?.length ?? 0) : fetchedTotalTickets;

  useEffect(() => {
    if (!skipInitialFetch && !ticketsLoading && onDataFetched) {
      onDataFetched(fetchedTickets, fetchedTotalTickets);
    }
  }, [skipInitialFetch, ticketsLoading, fetchedTickets, fetchedTotalTickets, onDataFetched]);

  const { sections: fetchedSections } = useSections();
  const { facilities: fetchedFacilities, loading: facilitiesLoadingRaw } = useFacilities();

  const sections = externalSections ?? fetchedSections;
  const allTechniciansData = externalTechnicians ?? [];
  const allFacilitiesData = externalFacilities ?? fetchedFacilities;
  const allUsersData = useMemo(() => externalUsers ?? [], [externalUsers]);

  const techniciansLoading = false; // Technicians must be provided externally now (deprecated endpoint)
  const facilitiesLoading = externalFacilities ? false : facilitiesLoadingRaw;
  const usersLoading = false; // Users must be provided externally now (deprecated endpoint)

  const { updateTicket } = useUpdateTicket();

  // ==================== DATA TRANSFORMATION ====================
  const tableData = useMemo(() => {
    return tickets.map((ticket) => {
      const raisedByStr = typeof ticket.raised_by === 'string'
        ? ticket.raised_by
        : ticket.raised_by.full_name || ticket.raised_by.username;
      const raisedByUser = allUsersData.find((user) => user.username === raisedByStr);
      const raisedByName = raisedByUser
        ? `${raisedByUser.first_name} ${raisedByUser.last_name}`
        : raisedByStr;

      return {
        ...ticket,
        searchField: `${String(ticket.ticket_no).toLowerCase()} ${(ticket.description ?? '').toLowerCase()}`,
        sectionName: formatSectionDisplay(ticket.section),
        raisedByName,
      };
    });
  }, [tickets, allUsersData]);

  // ==================== HANDLERS ====================
  const handleViewTicket = useCallback((ticket: Ticket) => {
    setSelectedTicket(ticket);
    setIsTicketDialogOpen(true);
  }, []);

  const handleTicketUpdate = useCallback(async (updatedTicket: Ticket) => {
    try {
      const updatePayload = {
        id: updatedTicket.id,
        ...extractWritableFields(updatedTicket),
      };
      const result = await updateTicket(updatePayload);
      refetch();
      setIsTicketDialogOpen(false);
      return result;
    } catch (error) {
      console.error('Failed to update ticket:', error);
    }
  }, [updateTicket, refetch]);

  const handlePageChange = useCallback((newPageIndex: number) => {
    setPageIndexRaw(newPageIndex);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSizeRaw(newPageSize);
    setPageIndexRaw(0);
  }, []);

  const setPageIndex = useCallback((index: number) => {
    handlePageChange(index);
  }, [handlePageChange]);

  // ==================== RETURN ====================
  return {
    // Pagination
    pageIndex,
    pageSize,
    hasNextPage,
    hasPrevPage,
    setPageIndex,
    setPageSize: handlePageSizeChange,

    // Filters
    statusFilter,
    sectionFilter,
    technicianFilter,
    userFilter,
    unassignedFilter,
    overdueFilter,
    setStatusFilter,
    setSectionFilter,
    setTechnicianFilter,
    setUserFilter,
    setUnassignedFilter,
    setOverdueFilter,

    // Dialog
    selectedTicket,
    isTicketDialogOpen,
    setSelectedTicket,
    setIsTicketDialogOpen,

    // Data
    tickets,
    totalTickets,
    sections,
    facilities: allFacilitiesData,
    technicians: allTechniciansData,
    users: allUsersData,
    tableData,

    // Loading
    loading: ticketsLoading,
    ticketsLoading,
    techniciansLoading,
    usersLoading,
    facilitiesLoading,

    // Actions
    handleViewTicket,
    handleTicketUpdate,
    handlePageChange,
    handlePageSizeChange,
    updateTicket,
    refetch,

    // Constants
    allStatuses: ALL_TICKET_STATUSES,
    commonTableProps: COMMON_TABLE_PROPS,
  };
};

export default useTicketTable;
