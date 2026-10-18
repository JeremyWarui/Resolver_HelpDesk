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
import type { Ticket, TicketTableVariant, } from '@/types';

export interface TablePagination {
  total: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (index: number) => void;
  onPageSizeChange: (size: number) => void;
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

  // DataTable's search box filters a hidden `searchField` column, which a plain
  // Ticket lacks. It is built here so every TicketTable gets a working search box.
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
      defaultPageSize={pagination?.pageSize ?? defaultPageSize}
      onPageChange={pagination?.onPageChange}
      onPageSizeChange={pagination?.onPageSizeChange}
      filterOptions={filterOptions}
    />
  );
}
