// The ticket list. Wraps DataTable with one column set per variant; the
// "Rate & close" action column belongs to the my-tickets variant alone.

import { useMemo } from 'react';
import DataTable from '@/components/shared/data/DataTable/DataTable';
import { useRole } from '@/lib/auth/permissions';
import {
  createVariantColumns,
  VARIANT_COLUMN_VISIBILITY,
} from '@/components/shared/data/DataTable/utils/TicketTableColumns';
import type { FilterOption } from '@/components/shared/data/DataTable/DataTable';
import type { SortingState } from '@tanstack/react-table';
import type { Ticket, TicketTableVariant, } from '@/types';

/** A table the server pages, sorts and searches, so all three cover every page. */
export interface TablePagination {
  total: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (index: number) => void;
  onPageSizeChange: (size: number) => void;
  /** The search box's text, as typed. */
  onSearchChange: (text: string) => void;
  /** The API's `ordering` value, or undefined for its default order. */
  onOrderingChange: (ordering: string | undefined) => void;
}

// Sortable column id → the field /tickets/ accepts in `?ordering=`.
const ORDERING_FIELD: Record<string, string> = {
  ticket_no: 'ticket_no',
  tradeName: 'trade__name',
  status: 'status',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

function toOrdering(sorting: SortingState): string | undefined {
  const sort = sorting[0];
  const field = sort && ORDERING_FIELD[sort.id];
  if (!field) return undefined;
  return sort.desc ? `-${field}` : field;
}

interface TicketTableProps {
  tickets: Ticket[];
  variant: TicketTableVariant;
  loading?: boolean;
  onRowClick?: (ticket: Ticket) => void;
  onRate?: (ticket: Ticket) => void;
  /** 'pending' variant only — clear the hold, or re-code it without clearing it. */
  onResume?: (ticket: Ticket) => void;
  onChangeReason?: (ticket: Ticket) => void;
  pagination?: TablePagination;
  selectedRowId?: number | null;
  rowClassName?: (ticket: Ticket) => string;
  emptyMessage?: string;
  emptyDescription?: string;
  searchPlaceholder?: string;
  filterOptions?: FilterOption[];
  title?: string;
  subtitle?: string;
  /** Rows per page when the table paginates in the browser. */
  defaultPageSize?: number;
  /**
   * Extra column ids to hide on top of the variant's own map.
   *
   * The technician's Pending Work uses it to drop Assigned To, which would repeat
   * their own name down a list that is theirs by definition.
   */
  hideColumns?: string[];
}

const TICKET_NOUN = { one: 'ticket', many: 'tickets' };

/** What the search box matches, the same three fields `/tickets/?search=` reads:
 *  the number, the service item (the Title column), and the description. */
const searchText = (ticket: Ticket) =>
  [ticket.ticket_no, ticket.service_item?.name, ticket.description].filter(Boolean).join(' ');

export function TicketTable({
  tickets,
  variant,
  loading = false,
  onRowClick,
  onRate,
  onResume,
  onChangeReason,
  pagination,
  hideColumns,
  selectedRowId = null,
  rowClassName,
  title,
  subtitle,
  defaultPageSize = 20,
  emptyMessage = 'No tickets found',
  emptyDescription = 'Try adjusting your filters.',
  searchPlaceholder = 'Search by ID or title…',
  filterOptions,
}: TicketTableProps) {
  const columns = useMemo(
    () => createVariantColumns({ variant, onRate, onResume, onChangeReason }),
    [variant, onRate, onResume, onChangeReason],
  );

  /**
   * Priority is shown by default to the two roles who act on it: the HOS sets
   * it as they hand the ticket over, and the technician decides what to do
   * next by it. Everyone else — the requester, the HOD, the manager, the
   * admin — gets it hidden but not removed, so the Columns menu turns it on,
   * and the ticket detail carries it either way.
   *
   * It is a role rule: the HOS and the admin read the same `admin` variant on
   * the same Tickets page.
   */
  const role = useRole();
  const showsPriority = role === 'hos' || role === 'technician';

  const columnVisibility = useMemo(
    () => ({
      ...VARIANT_COLUMN_VISIBILITY[variant],
      priority: showsPriority,
      ...Object.fromEntries((hideColumns ?? []).map((id) => [id, false])),
    }),
    [variant, showsPriority, hideColumns],
  );

  return (
    <DataTable
      columns={columns}
      data={tickets}
      title={title}
      subtitle={subtitle}
      loading={loading}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      // Tinting is opt-in: the HOS/HOD badge already marks an escalated row. A page
      // that needs a tint passes its own, as EscalatedWorkView does on `is_breaching`.
      rowClassName={rowClassName}
      emptyStateMessage={emptyMessage}
      emptyStateDescription={emptyDescription}
      initialColumnVisibility={columnVisibility}
      searchPlaceholder={searchPlaceholder}
      noun={TICKET_NOUN}
      manualPagination={!!pagination}
      totalItems={pagination?.total}
      pageIndex={pagination?.pageIndex}
      defaultPageSize={pagination?.pageSize ?? defaultPageSize}
      onPageChange={pagination?.onPageChange}
      onPageSizeChange={pagination?.onPageSizeChange}
      onSearchChange={pagination?.onSearchChange}
      searchText={searchText}
      onSortingChange={pagination && ((sorting) => pagination.onOrderingChange(toOrdering(sorting)))}
      filterOptions={filterOptions}
    />
  );
}
