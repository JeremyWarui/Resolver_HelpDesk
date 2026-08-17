import { useState } from 'react';
import { useTicketTable } from '@/hooks/tickets';
import { useTicketFilterOptions } from '@/hooks/tickets/useTicketFilterOptions';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import {
  createStatusFilter,
  createTradeFilter,
  createTechnicianFilter,
  createUserFilter,
} from '@/components/shared/data/DataTable/utils/FilterUtils';
import type { FilterOption } from '@/components/shared/data/DataTable/DataTable';
import type { FilterPill } from '@/types';

function AllTicketsTable({
  role = 'admin',
  onTicketSelect,
}: {
  role?: 'admin' | 'manager' | 'hod' | 'hos';
  onTicketSelect?: (ticketId: number) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const table = useTicketTable({
    role,
    defaultPageSize: 20,
    defaultStatusFilter: 'all',
  });

  const pills: FilterPill[] = [
    { key: 'all',         label: 'All' },
    { key: 'open',        label: 'Open',        variant: 'open' },
    { key: 'in_progress', label: 'In Progress', variant: 'in_progress' },
    { key: 'overdue',     label: 'Overdue',     variant: 'danger' },
    { key: 'resolved',    label: 'Resolved',    variant: 'resolved' },
  ];

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    if (filter === 'overdue') {
      table.setOverdueFilter(true);
      table.setStatusFilter('all');
    } else {
      table.setOverdueFilter(false);
      table.setStatusFilter(filter === 'all' ? 'all' : filter);
    }
    table.setPageIndex(0);
  };

  /**
   * The dropdown counterpart to the pills above.
   *
   * The pills are a shortlist — they cover four of the six statuses, so
   * Assigned, Pending and Closed were unreachable from this table even though
   * the server has always accepted them. Both controls drive the same
   * `statusFilter`, so they are kept in step rather than left to disagree:
   *
   *  - `activeFilter` is set to the chosen status, so a pill that represents it
   *    lights up and one that doesn't (assigned/pending/closed) leaves the row
   *    unlit — which is the honest reading of "the dropdown is driving".
   *  - Overdue is cleared. It is a cross-status flag, not a status, and leaving
   *    it set would silently intersect with the choice and draw an empty table
   *    with nothing on screen to explain why.
   */
  const handleStatusSelect = (value: string) => {
    setActiveFilter(value);
    table.setOverdueFilter(false);
    table.setStatusFilter(value);
    table.setPageIndex(0);
  };

  // Scoped filter options (sections / technicians / requesters that appear in
  // the caller's tickets). One server-scoped source serves every role.
  const { technicians, requesters } = useTicketFilterOptions();

  // Build the dropdowns from the scoped {id,name} lists and wire each to the
  // server-side filter setters on useTicketTable. Computed inline (no useMemo):
  // the result is only mapped to render the dropdowns in DataTable — nothing
  // keys on its identity.
  //
  // This was a section filter, skipped for HOS because they have one section —
  // but every other role was in the same position for a different reason: one
  // section type means one option. The trade filter is useful to all of them,
  // HOS included, so there is no role exclusion here.
  const filterOptions: FilterOption[] = [
    createStatusFilter(
      table.statusFilter,
      handleStatusSelect,
      table.allStatuses,
      table.setPageIndex,
    ),
    createTradeFilter(
      table.tradeFilter ?? 'all',
      (v) => table.setTradeFilter(v == null ? null : Number(v)),
      table.trades,
      table.setPageIndex,
    ),
    createTechnicianFilter(
      String(table.technicianFilter ?? 'all'),
      (v) => table.setTechnicianFilter(v === 'all' ? null : Number(v)),
      technicians,
      undefined,
      table.setPageIndex,
    ),
    createUserFilter(
      String(table.userFilter ?? 'all'),
      (v) => table.setUserFilter(v === 'all' ? null : Number(v)),
      requesters,
      table.setPageIndex,
    ),
  ];

  return (
    <div className="space-y-3">
      <FilterPills pills={pills} active={activeFilter} onChange={handleFilterChange} loading={table.loading} className="justify-end" />

      <TicketTable
        tickets={table.tickets}
        variant="admin"
        title="Tickets"
        loading={table.loading}
        onRowClick={onTicketSelect ? (t) => onTicketSelect(t.id) : table.handleViewTicket}
        onOpenTicket={onTicketSelect ? undefined : table.setSelectedTicket}
        onOpenTicketDialog={onTicketSelect ? undefined : table.setIsTicketDialogOpen}
        selectedRowId={table.selectedTicket?.id ?? null}
        filterOptions={filterOptions}
        pagination={{
          total: table.totalTickets,
          pageIndex: table.pageIndex,
          pageSize: table.pageSize,
          onPageChange: table.handlePageChange,
          onPageSizeChange: table.handlePageSizeChange,
        }}
      />

    </div>
  );
}

export default AllTicketsTable;
