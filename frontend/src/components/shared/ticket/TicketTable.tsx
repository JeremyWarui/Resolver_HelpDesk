// TicketTable — canonical ticket display component.
// Wraps DataTable (TanStack Table + shadcn Table) with 5 variant column sets.
//
// Decision (Phase 3 audit): extends the existing DataTable/TableUtils pattern.
// Columns stay clean single-value cells; StatusBadge and PriorityBadge replace
// the hardcoded colour classes that previously lived in TableUtils.tsx.
// The "Rate & close" action column is unique to the my-tickets variant.
//
// Composed usage (all ticket list views):
//   const { filters, setFilters } = useTicketFilters()
//   <FilterPills pills={pills} active={filters.status ?? 'all'} onChange={(k) => setFilters({ status: k })} />
//   <TicketTable tickets={data} variant="queue" loading={isLoading} onRowClick={...} />

import { useMemo } from 'react';
import DataTable from '@/components/shared/data/DataTable/DataTable';
import {
  createVariantColumns,
  VARIANT_COLUMN_VISIBILITY,
} from '@/components/shared/data/DataTable/utils/TicketTableColumns';
import { escalatedRowClass } from '@/components/shared/ticket/EscalationBadge';
import type { FilterOption } from '@/components/shared/data/DataTable/DataTable';
import type { Ticket, TicketTableVariant, BulkAction } from '@/types';

export interface TicketTableProps {
  tickets: Ticket[];
  variant: TicketTableVariant;
  loading?: boolean;
  onRowClick?: (ticket: Ticket) => void;
  onOpenTicket?: (ticket: Ticket | null) => void;
  onOpenTicketDialog?: (open: boolean) => void;
  onRate?: (ticket: Ticket) => void;
  /** 'pending' variant only — clear the hold, or re-code it without clearing it. */
  onResume?: (ticket: Ticket) => void;
  onChangeReason?: (ticket: Ticket) => void;
  pagination?: {
    total: number;
    pageIndex: number;
    pageSize: number;
    onPageChange: (index: number) => void;
    onPageSizeChange: (size: number) => void;
  };
  selectedRowId?: number | null;
  bulkActions?: BulkAction[];
  rowClassName?: (ticket: Ticket) => string;
  title?: string;
  emptyMessage?: string;
  emptyDescription?: string;
  searchPlaceholder?: string;
  filterOptions?: FilterOption[];
}

export function TicketTable({
  tickets,
  variant,
  loading = false,
  onRowClick,
  onOpenTicket,
  onOpenTicketDialog,
  onRate,
  onResume,
  onChangeReason,
  pagination,
  selectedRowId = null,
  rowClassName,
  title,
  emptyMessage = 'No tickets found',
  emptyDescription = 'Try adjusting your filters.',
  searchPlaceholder = 'Search by ID or title…',
  filterOptions,
}: TicketTableProps) {
  const columns = useMemo(
    () =>
      createVariantColumns({
        variant,
        setSelectedTicket: onOpenTicket,
        setIsTicketDialogOpen: onOpenTicketDialog,
        onRate,
        onResume,
        onChangeReason,
      }),
    [variant, onOpenTicket, onOpenTicketDialog, onRate, onResume, onChangeReason],
  );

  const columnVisibility = VARIANT_COLUMN_VISIBILITY[variant];

  // DataTable's search box filters a hidden `searchField` column. Callers pass
  // plain Ticket objects, which have no such property, so the accessor read
  // `undefined` and *any* non-empty query matched no row — the box emptied the
  // table instead of searching it. `useTicketTable` builds this field for the
  // tables that go through it, which is why the technician queue searched fine
  // and My Tickets did not; only an e2e run comparing the two showed it, since
  // `searchField` is an extra property and TypeScript never had an opinion.
  //
  // Derived here so every consumer of TicketTable gets a working search box
  // rather than each one remembering to map it.
  const rows = useMemo(
    () =>
      tickets.map((ticket) => ({
        ...ticket,
        // ID and "title" as the box promises — a ticket has no title field,
        // so the Title column shows `service_item.name` and this matches it.
        searchField: [ticket.ticket_no, ticket.service_item?.name, ticket.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      })),
    [tickets],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      variant="admin"
      title={title}
      loading={loading}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      // Escalated rows tint red by default. A caller that passes its own
      // `rowClassName` wins outright rather than composing — EscalatedWorkView
      // tints on `is_breaching`, and on a list where every row is escalated by
      // definition the escalation tint says nothing while the breach tint does.
      rowClassName={rowClassName ?? escalatedRowClass}
      emptyStateMessage={emptyMessage}
      emptyStateDescription={emptyDescription}
      initialColumnVisibility={columnVisibility}
      searchPlaceholder={searchPlaceholder}
      manualPagination={!!pagination}
      totalItems={pagination?.total}
      defaultPageSize={pagination?.pageSize ?? 20}
      onPageChange={pagination?.onPageChange}
      onPageSizeChange={pagination?.onPageSizeChange}
      filterOptions={filterOptions}
    />
  );
}
