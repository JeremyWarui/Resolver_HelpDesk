import { useTicketTable } from '@/hooks/tickets/useTicketTable';
import { useTicketTableFilters } from '@/components/shared/data/DataTable/utils/TicketTableFilters';
import { TicketTable } from '@/components/shared/ticket/TicketTable';

interface Props {
  onTicketSelect?: (id: number) => void;
}

/** The latest tickets in the caller's scope, under the dashboard charts. */
export default function RecentTicketsTable({ onTicketSelect }: Props) {
  const table = useTicketTable({ defaultPageSize: 25 });
  const filters = useTicketTableFilters(table, {
    includeTechnician: true,
    includeRequester: true,
  });

  return (
    <TicketTable
      tickets={table.tickets}
      variant="admin"
      title="Recent Tickets"
      loading={table.loading}
      filterOptions={filters}
      defaultPageSize={10}
      onRowClick={onTicketSelect ? (t) => onTicketSelect(t.id) : undefined}
      selectedRowId={table.selectedTicket?.id ?? null}
    />
  );
}
