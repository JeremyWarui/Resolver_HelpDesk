import { useState } from 'react';
import TicketStatsCards from '@/components/shared/data/TicketStatsCards';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { useTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import { useTicketTable } from '@/hooks/tickets/useTicketTable';
import { SCOPE_SUBTITLE } from '@/constants/roles';
import type { FilterPill } from '@/types';

type TicketsRole = 'admin' | 'manager' | 'hod' | 'hos';

interface Props {
  role: TicketsRole;
  onTicketSelect?: (ticketId: number) => void;
}

/** The shortlist above the table. Four of the six statuses plus Overdue, which
 *  is a cross-status flag rather than a status — the dropdown reaches the rest. */
const PILLS: FilterPill[] = [
  { key: 'all',         label: 'All' },
  { key: 'open',        label: 'Open',        variant: 'open' },
  { key: 'in_progress', label: 'In Progress', variant: 'in_progress' },
  { key: 'overdue',     label: 'Overdue',     variant: 'danger' },
  { key: 'resolved',    label: 'Resolved',    variant: 'resolved' },
];

/** The tickets page for a supervising role. The cards and the table are scoped by the server. */
export default function RoleTicketsPage({ role, onTicketSelect }: Props) {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const table = useTicketTable({ defaultPageSize: 20 });

  /**
   * The pills and the status dropdown drive the same `statusFilter`, so they
   * stay in step. Overdue is cleared whenever a status is chosen: it is a
   * cross-status flag, and leaving it set would intersect with the choice and
   * draw an empty table with nothing on screen to explain why.
   */
  const handleStatusChange = (value: string) => {
    setActiveFilter(value);
    const isOverdue = value === 'overdue';
    table.setOverdueFilter(isOverdue);
    table.setStatusFilter(isOverdue ? 'all' : value);
  };

  const filterOptions = useTicketTableFilters(table, {
    includeTechnician: true,
    includeRequester: true,
    onStatusChange: handleStatusChange,
  });

  return (
    <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
      <p className="text-sm text-gray-600 mb-2">{SCOPE_SUBTITLE[role]}</p>
      <TicketStatsCards />
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
    </div>
  );
}
