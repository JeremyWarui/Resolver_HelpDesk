import { useTicketTable } from '@/hooks/tickets/useTicketTable';
import { useAuthStore } from '@/stores/authStore';
import { useTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import TicketStatsCards from '@/components/shared/data/TicketStatsCards';

/** Every ticket in this technician's trades at their campus, theirs or not. */
const TechSectionTickets = ({ onTicketSelect }: { onTicketSelect?: (ticketId: number) => void }) => {
  const userData = useAuthStore((s) => s.user);
  // No assigned_to and no trade pin: `scoped_ticket_qs` already returns exactly
  // this technician's (campus, trade) pairs, so the pool needs no narrowing here.
  const table = useTicketTable({ defaultStatusFilter: 'all', defaultPageSize: 20 });

  const filters = useTicketTableFilters(table);

  return (
    <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-4">
      <p className="font-semibold text-gray-900">
        Welcome back, {userData?.first_name || 'Technician'}
      </p>

      <TicketStatsCards />

      <TicketTable
        tickets={table.tickets}
        variant="admin"
        title="Section Tickets — your trades"
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
