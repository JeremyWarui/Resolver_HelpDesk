import { useMemo, useState } from 'react';
import { useTicketTable } from '@/hooks/tickets';
import { useTechnicianDashboard } from '@/hooks/dashboard';
import { createTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { createTicketTableColumns } from '@/components/shared/data/DataTable/utils/TicketTableColumns';
import { createTicketColumnVisibility } from '@/components/shared/data/DataTable/utils/TicketColumnVisibility';
import DataTable from '@/components/shared/data/DataTable/DataTable';
import { TechTableHeader } from '@/components/shared/data/DataTable/utils/TableHeaders';
import { FilterPills } from '@/components/shared/data/FilterPills';
import type { FilterPill } from '@/types';
import TechnicianStatsCards from './TechnicianStatsCards';
import type { Section } from '@/types';

type TechTicketsProps = {
  currentTechnicianId?: number;
  onTicketSelect?: (ticketId: number) => void;
};

function TechTickets({ currentTechnicianId, onTicketSelect }: TechTicketsProps) {
  const { data: dashboardData } = useTechnicianDashboard();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Convert dashboard sections to Section type for table filters
  const externalSections: Section[] | undefined = dashboardData?.sections?.map(s => ({
    id: s.id,
    name: s.name,
    code: s.code,
    campus: { code: s.campus, name: s.campus },
    department: { code: s.department, name: s.department },
    section_type_name: s.section_type_name,
  } as unknown as Section));

  // Pin the page to the technician's OWN tickets (B2): without assigned_to the
  // fetch returns their full section scope, which belongs to Section Tickets.
  const fixedParams = useMemo(
    () => (currentTechnicianId ? { assigned_to: currentTechnicianId } : {}),
    [currentTechnicianId],
  );

  // Lazy-fetch only when filter changes
  const table = useTicketTable({
    role: 'technician',
    currentUserId: currentTechnicianId,
    defaultStatusFilter: statusFilter,
    defaultPageSize: 20,
    externalSections,
    skipUntilUserId: true,
    fixedParams,
  });

  // Derive counts from actual fetched tickets so stat cards match the table
  const filterCounts = useMemo(() => {
    const tickets = table.tickets;
    return {
      all: table.totalTickets,
      // 'open' tickets are unassigned by definition — never the technician's own.
      assigned: tickets.filter(t => t.status === 'assigned').length,
      in_progress: tickets.filter(t => t.status === 'in_progress').length,
      pending: tickets.filter(t => t.status === 'pending').length,
      resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
    };
  }, [table.tickets, table.totalTickets]);

  const columns = useMemo(() => createTicketTableColumns({
    role: 'technician',
    allStatuses: table.allStatuses,
    setSelectedTicket: table.setSelectedTicket,
    setIsTicketDialogOpen: table.setIsTicketDialogOpen,
  }), [table.allStatuses, table.setSelectedTicket, table.setIsTicketDialogOpen]);

  const filters = createTicketTableFilters(table, {
    includeStatus: true,
    includeSection: false,
    includeTechnician: false,
    includeUser: false,
  });

  const columnVisibility = createTicketColumnVisibility({ role: 'technician' });

  const handleFilterChange = (filter: string) => {
    setStatusFilter(filter);
    table.setStatusFilter(filter);
    table.setPageIndex(0);
  };

  return (
    <>
      <TechnicianStatsCards counts={filterCounts} loading={table.loading} />

      <FilterPills
        pills={[
          { key: 'all',         label: 'All' },
          { key: 'assigned',    label: 'Assigned',    variant: 'assigned' },
          { key: 'in_progress', label: 'In Progress', variant: 'in_progress' },
          { key: 'pending',     label: 'On Hold',     variant: 'pending' },
          { key: 'resolved',    label: 'Resolved',    variant: 'resolved' },
        ] satisfies FilterPill[]}
        active={statusFilter}
        onChange={handleFilterChange}
        loading={table.loading}
        className="justify-end"
      />

      <DataTable
        variant="tech"
        columns={columns}
        data={table.tableData}
        title="Assigned Tickets"
        subtitle=""
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
        renderHeader={TechTableHeader}
        manualPagination={true}
      />

    </>
  );
}

export default TechTickets;
