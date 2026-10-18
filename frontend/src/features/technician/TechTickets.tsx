import { useMemo, useState } from 'react';
import { useTicketTable } from '@/hooks/tickets/useTicketTable';
import { useTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { statusPills } from '@/constants/tickets';

// `open` means unassigned, so it is never one of a technician's own tickets.
const TECH_PILLS = statusPills(['assigned', 'in_progress', 'pending', 'resolved']);

type TechTicketsProps = {
  currentTechnicianId?: number;
  onTicketSelect?: (ticketId: number) => void;
};

/** Every job assigned to the technician, as a table: the All My Jobs tab. */
function TechTickets({ currentTechnicianId, onTicketSelect }: TechTicketsProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pin the page to the technician's OWN tickets: without assigned_to the
  // fetch returns their full section scope, which belongs to Section Tickets.
  const fixedParams = useMemo(
    () => (currentTechnicianId ? { assigned_to: currentTechnicianId } : {}),
    [currentTechnicianId],
  );

  const table = useTicketTable({
    currentUserId: currentTechnicianId,
    defaultStatusFilter: statusFilter,
    defaultPageSize: 20,
    skipUntilUserId: true,
    fixedParams,
  });

  const filters = useTicketTableFilters(table, { includeTrade: false });

  const handleFilterChange = (filter: string) => {
    setStatusFilter(filter);
    table.setStatusFilter(filter);
    table.setPageIndex(0);
  };

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <FilterPills
        pills={TECH_PILLS}
        active={statusFilter}
        onChange={handleFilterChange}
        loading={table.loading}
        className="justify-end"
      />

      <TicketTable
        tickets={table.tickets}
        variant="my-jobs"
        title="All my jobs"
        subtitle="Every job assigned to you, finished ones included"
        loading={table.loading}
        filterOptions={filters}
        onRowClick={onTicketSelect ? (t) => onTicketSelect(t.id) : table.handleViewTicket}
        selectedRowId={table.selectedTicket?.id ?? null}
        pagination={table.pagination}
      />
    </div>
  );
}

export default TechTickets;
