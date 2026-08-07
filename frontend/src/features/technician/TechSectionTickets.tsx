import { useMemo } from 'react';
import { useTicketTable } from '@/hooks/tickets';
import { useTechnicianDashboard } from '@/hooks/dashboard';
import { useAuthStore } from '@/stores/authStore';
import { createTicketTableColumns } from '@/components/shared/data/DataTable/utils/TicketTableColumns';
import { createTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { createTicketColumnVisibility } from '@/components/shared/data/DataTable/utils/TicketColumnVisibility';
import DataTable from '@/components/shared/data/DataTable/DataTable';
import { StatCardsRenderer } from '@/components/shared/data/StatCards';
import { STAT_VIEWS } from '@/constants/statCardsConfig';
import type { Section } from '@/types';

const TechSectionTickets = ({ currentTechnicianId, onTicketSelect }: { currentTechnicianId?: number; onTicketSelect?: (ticketId: number) => void }) => {
  const userData = useAuthStore((s) => s.user);
  const { data: dashboardData, loading } = useTechnicianDashboard();

  const sectional = dashboardData?.sectional;

  const externalSections: Section[] | undefined = dashboardData?.sections?.map(s => ({
    id: s.id,
    name: s.name,
    code: s.code,
    campus: { code: s.campus, name: s.campus },
    department: { code: s.department, name: s.department },
    section_type_name: s.section_type_name,
  } as unknown as Section));

  const table = useTicketTable({
    role: 'technician',
    currentUserId: currentTechnicianId,
    fetchSectionTickets: true,
    defaultStatusFilter: 'all',
    defaultPageSize: 20,
    externalSections,
  });

  const columns = useMemo(() => createTicketTableColumns({
    role: 'technician',
    allStatuses: table.allStatuses,
    setSelectedTicket: table.setSelectedTicket,
    setIsTicketDialogOpen: table.setIsTicketDialogOpen,
  }), [table.allStatuses, table.setSelectedTicket, table.setIsTicketDialogOpen]);

  const filters = createTicketTableFilters(table, { includeStatus: true, includeSection: true });

  const columnVisibility = createTicketColumnVisibility({
    role: 'technician',
    customVisibility: {
      assigned_to: true,
      actions: false,
    }
  });

  return (
    <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-4">
      <div>
        <p className="font-semibold text-gray-900">
          Welcome back, {userData?.first_name || 'Technician'}
        </p>
      </div>

      <StatCardsRenderer
        statDefinitions={STAT_VIEWS.section_head_personal}
        data={(sectional ?? {}) as Record<string, unknown>}
        loading={loading}
      />

      <DataTable
        variant="admin"
        title="Section Tickets"
        columns={columns}
        data={table.tableData}
        {...table.commonTableProps}
        filterOptions={filters}
        initialColumnVisibility={columnVisibility}
        totalItems={table.totalTickets}
        loading={table.loading}
        onPageChange={table.handlePageChange}
        onPageSizeChange={table.handlePageSizeChange}
        onRowClick={onTicketSelect ? (t) => onTicketSelect(t.id) : table.handleViewTicket}
        selectedRowId={table.selectedTicket?.id || null}
        manualPagination={true}
        defaultPageSize={20}
      />
    </div>
  );
};

export default TechSectionTickets;
