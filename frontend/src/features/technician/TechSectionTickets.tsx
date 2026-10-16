import { useTicketTable } from '@/hooks/tickets/useTicketTable';
import { useTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { TicketTable } from '@/components/shared/ticket/TicketTable';

/** Every ticket in this technician's trades at their campus, theirs or not. */
const TechSectionTickets = ({ onTicketSelect }: { onTicketSelect?: (ticketId: number) => void }) => {
  // No assigned_to and no trade pin: `scoped_ticket_qs` already returns exactly
  // this technician's (campus, trade) pairs, so the pool needs no narrowing here.
  // Live work by default; "All Statuses" brings back the finished jobs.
  const table = useTicketTable({ defaultStatusFilter: 'active', defaultPageSize: 20 });

  const filters = useTicketTableFilters(table);

  return (
    <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-4">
      <TicketTable
        tickets={table.tickets}
        variant="section"
        title="Section Tickets"
        subtitle="Everything in your trades at your campus, whoever has it"
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
};

export default TechSectionTickets;
