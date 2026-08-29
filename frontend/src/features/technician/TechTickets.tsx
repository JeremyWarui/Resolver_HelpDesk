import { useMemo, useState } from 'react';
import { useTicketTable } from '@/hooks/tickets/useTicketTable';
import { useTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import { FilterPills } from '@/components/shared/data/FilterPills';
import TechnicianStatsCards from '@/components/shared/data/TechnicianStatsCards';
import { statusPills } from '@/constants/tickets';

// `open` means unassigned, so it is never one of a technician's own tickets.
const TECH_PILLS = statusPills(['assigned', 'in_progress', 'pending', 'resolved']);

type TechTicketsProps = {
  currentTechnicianId?: number;
  onTicketSelect?: (ticketId: number) => void;
};

/** The technician's own queue — what is assigned to them, and nothing else. */
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

  // Derived from the rows actually fetched, so the cards match the table.
  const filterCounts = useMemo(() => {
    const tickets = table.tickets;
    return {
      assigned: tickets.filter(t => t.status === 'assigned').length,
      in_progress: tickets.filter(t => t.status === 'in_progress').length,
      pending: tickets.filter(t => t.status === 'pending').length,
      resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
    };
  }, [table.tickets]);

  const filters = useTicketTableFilters(table, { includeTrade: false });

  const handleFilterChange = (filter: string) => {
    setStatusFilter(filter);
    table.setStatusFilter(filter);
    table.setPageIndex(0);
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-4">
      <TechnicianStatsCards counts={filterCounts} loading={table.loading} />

      <FilterPills
        pills={TECH_PILLS}
        active={statusFilter}
        onChange={handleFilterChange}
        loading={table.loading}
        className="justify-end"
      />

      <TicketTable
        tickets={table.tickets}
        variant="admin"
        title="Assigned Tickets"
        subtitle="Tickets assigned to you"
        loading={table.loading}
        filterOptions={filters}
        onRowClick={onTicketSelect ? (t) => onTicketSelect(t.id) : table.handleViewTicket}
        selectedRowId={table.selectedTicket?.id ?? null}
        pagination={{
          total: table.totalTickets,
          pageIndex: table.pageIndex,
          pageSize: table.pageSize,
          onPageChange: table.setPageIndex,
          onPageSizeChange: table.setPageSize,
        }}
      />
    </div>
  );
}

export default TechTickets;
