import { useTicketTable } from "@/hooks/tickets";
import { useTicketFilterOptions } from "@/hooks/tickets/useTicketFilterOptions";
import { createStatusFilter, createSectionFilter, createTechnicianFilter, createUserFilter } from "@/components/shared/data/DataTable/utils/FilterUtils";
import { createTicketTableColumns } from "@/components/shared/data/DataTable/utils/TicketTableColumns";
import { createTicketColumnVisibility } from "@/components/shared/data/DataTable/utils/TicketColumnVisibility";
import type { FilterOption } from "@/components/shared/data/DataTable/DataTable";
import DataTable from "@/components/shared/data/DataTable/DataTable";
import { AdminTableHeader } from '@/components/shared/data/DataTable/utils/TableHeaders';

type RecentTicketsRole = 'admin' | 'manager' | 'hod' | 'hos';

interface RecentTicketsTableProps {
  role?: RecentTicketsRole;
  onTicketSelect?: (id: number) => void;
}

export default function RecentTicketsTable({ role = 'admin', onTicketSelect }: RecentTicketsTableProps) {
  const table = useTicketTable({ role, defaultPageSize: 25 });
  const { sections, technicians, requesters } = useTicketFilterOptions();

  const columns = createTicketTableColumns({
    role,
    technicians: table.technicians,
    allStatuses: table.allStatuses,
    setSelectedTicket: table.setSelectedTicket,
    setIsTicketDialogOpen: table.setIsTicketDialogOpen,
  });

  const filters: FilterOption[] = [
    createStatusFilter(table.statusFilter, table.setStatusFilter, table.allStatuses, table.setPageIndex),
    createSectionFilter(
      table.sectionFilter ?? 'all',
      (v) => table.setSectionFilter(v == null ? null : Number(v)),
      sections,
      table.setPageIndex,
    ),
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

  const columnVisibility = createTicketColumnVisibility({ role });

  return (
    <DataTable
      variant="admin"
      columns={columns}
      data={table.tableData}
      title="Recent Tickets"
      defaultPageSize={10}
      manualPagination={false}
      initialColumnVisibility={columnVisibility}
      filterOptions={filters}
      loading={table.loading}
      onRowClick={onTicketSelect ? (t) => onTicketSelect(t.id) : undefined}
      selectedRowId={table.selectedTicket?.id || null}
      renderHeader={AdminTableHeader}
    />
  );
}
