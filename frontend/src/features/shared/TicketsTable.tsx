import { useState } from 'react';
import { useTicketTable } from '@/hooks/tickets/useTicketTable';
import { useTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import type { FilterPill } from '@/types';

/** The shortlist above the table. Four of the six statuses plus Overdue, which
 *  is a cross-status flag rather than a status — the dropdown reaches the rest. */
const PILLS: FilterPill[] = [
  { key: 'all',         label: 'All' },
  { key: 'open',        label: 'Open',        variant: 'open' },
  { key: 'in_progress', label: 'In Progress', variant: 'in_progress' },
  { key: 'overdue',     label: 'Overdue',     variant: 'danger' },
  { key: 'resolved',    label: 'Resolved',    variant: 'resolved' },
];

/** Every ticket in the caller's scope. The scope is the JWT's — this takes no
 *  role, because nothing here varies by one. */
function AllTicketsTable({ onTicketSelect }: { onTicketSelect?: (ticketId: number) => void }) {
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const table = useTicketTable({
    defaultPageSize: 20,
    defaultStatusFilter: 'all',
  });

  /**
   * The pills and the status dropdown drive the same `statusFilter`, so they
   * stay in step: `activeFilter` takes the
   * chosen status either way, and a pill that represents it lights up while
   * one that doesn't (assigned/pending/closed) leaves the row unlit.
   *
   * Overdue is cleared whenever a status is chosen. It is a cross-status flag,
   * and leaving it set would silently intersect with the choice and draw an
   * empty table with nothing on screen to explain why.
   */
  const handleStatusChange = (value: string) => {
    setActiveFilter(value);
    const isOverdue = value === 'overdue';
    table.setOverdueFilter(isOverdue);
    table.setStatusFilter(isOverdue ? 'all' : value);
    table.setPageIndex(0);
  };

  const filterOptions = useTicketTableFilters(table, {
    includeTechnician: true,
    includeRequester: true,
    onStatusChange: handleStatusChange,
  });

  return (
    <div className="space-y-3">
      <FilterPills
        pills={PILLS}
        active={activeFilter}
        onChange={handleStatusChange}
        loading={table.loading}
        className="justify-end"
      />

      <TicketTable
        tickets={table.tickets}
        variant="admin"
        title="Tickets"
        loading={table.loading}
        onRowClick={onTicketSelect ? (t) => onTicketSelect(t.id) : table.handleViewTicket}
        selectedRowId={table.selectedTicket?.id ?? null}
        filterOptions={filterOptions}
        pagination={table.pagination}
      />
    </div>
  );
}

export default AllTicketsTable;
