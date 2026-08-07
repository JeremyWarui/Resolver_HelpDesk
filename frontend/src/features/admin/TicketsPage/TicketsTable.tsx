import { useState } from 'react';
import { useTicketTable } from '@/hooks/tickets';
import { useTicketFilterOptions } from '@/hooks/tickets/useTicketFilterOptions';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import {
  createSectionFilter,
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

  // Scoped filter options (sections / technicians / requesters that appear in
  // the caller's tickets). One server-scoped source serves every role.
  const { sections, technicians, requesters } = useTicketFilterOptions();

  // Build the dropdowns from the scoped {id,name} lists and wire each to the
  // server-side filter setters on useTicketTable. Section is omitted for HOS
  // (single section). Computed inline (no useMemo): the result is only mapped to
  // render the dropdowns in DataTable — nothing keys on its identity.
  const filterOptions: FilterOption[] = [
    ...(role !== 'hos'
      ? [
          createSectionFilter(
            table.sectionFilter ?? 'all',
            (v) => table.setSectionFilter(v == null ? null : Number(v)),
            sections,
            table.setPageIndex,
          ),
        ]
      : []),
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
