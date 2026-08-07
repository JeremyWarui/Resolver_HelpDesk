import { useMemo } from 'react';
import { useTicketTable } from '@/hooks/tickets';
import { createTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { createTicketTableColumns } from '@/components/shared/data/DataTable/utils/TicketTableColumns';
import { createTicketColumnVisibility } from '@/components/shared/data/DataTable/utils/TicketColumnVisibility';
import DataTable from '@/components/shared/data/DataTable/DataTable';
import { useManagerDashboard } from '@/hooks/dashboard';
import ManagerStatsCards from './ManagerStatsCards';

const ManagerTickets = ({ userId, onTicketSelect }: { userId?: number; onTicketSelect?: (ticketId: number) => void }) => {
  const { data, loading } = useManagerDashboard();
  const table = useTicketTable({
    role: 'manager',
    currentUserId: userId,
  });

  const columns = useMemo(() => createTicketTableColumns({
    role: 'manager',
    allStatuses: table.allStatuses,
    setSelectedTicket: table.setSelectedTicket,
    setIsTicketDialogOpen: table.setIsTicketDialogOpen,
  }), [table.allStatuses, table.setSelectedTicket, table.setIsTicketDialogOpen]);

  const filters = createTicketTableFilters(table, {
    includeStatus: true,
    includeSection: true,
    includeTechnician: true,
    includeUser: false,
  });

  const columnVisibility = createTicketColumnVisibility({ role: 'manager' });

  return (
    <main className="flex-1 overflow-y-auto p-3 bg-gray-50">
      {/* Stat Cards Section */}
      <div className="mb-4">
        <ManagerStatsCards analyticsData={data} loading={loading} />
      </div>

      {/* Tickets Table Section */}
      <DataTable
        variant="admin"
        columns={columns}
        data={table.tableData}
        title="All Department Tickets"
        subtitle={`${table.totalTickets} ticket${table.totalTickets !== 1 ? 's' : ''}`}
        {...table.commonTableProps}
        defaultPageSize={20}
        initialColumnVisibility={columnVisibility}
        filterOptions={filters}
        totalItems={table.totalTickets}
        loading={table.loading}
        onPageChange={table.handlePageChange}
        onPageSizeChange={table.handlePageSizeChange}
        onRowClick={onTicketSelect ? (t) => onTicketSelect(t.id) : table.handleViewTicket}
        selectedRowId={table.selectedTicket?.id || null}
        manualPagination={true}
      />

    </main>
  );
};

export default ManagerTickets;
