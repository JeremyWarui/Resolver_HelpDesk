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
      }),
    [variant, onOpenTicket, onOpenTicketDialog, onRate],
  );

  const columnVisibility = VARIANT_COLUMN_VISIBILITY[variant];

  return (
    <DataTable
      columns={columns}
      data={tickets}
      variant="admin"
      title={title}
      loading={loading}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      rowClassName={rowClassName}
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
