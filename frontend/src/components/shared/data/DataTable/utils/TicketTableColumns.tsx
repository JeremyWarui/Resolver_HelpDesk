import type { ColumnDef } from '@tanstack/react-table';
import type { Ticket, TicketTableVariant } from '@/types';
import * as TableUtils from './TableUtils';

// The ticket column factory, read through TicketTable.
//
// Columns are keyed by variant — what the table is for — and never by role.
// Who sees Priority is a viewer rule, applied in TicketTable, so the same list
// renders the same way whichever page you arrived through.

interface VariantColumnsConfig {
  variant: TicketTableVariant;
  onRate?: (ticket: Ticket) => void;
  /** 'pending' variant — clear the hold, or re-code it without clearing it. */
  onResume?: (ticket: Ticket) => void;
  onChangeReason?: (ticket: Ticket) => void;
}

export function createVariantColumns(config: VariantColumnsConfig): ColumnDef<Ticket>[] {
  const { variant, onRate, onResume, onChangeReason } = config;

  // Shared pool — all possible columns
  const all: ColumnDef<Ticket>[] = [
    TableUtils.ticketNoColumn('ID'),
    TableUtils.ticketTitleColumn('Title'),
    TableUtils.descriptionColumn('Description'),
    TableUtils.tradeColumn('Trade'),
    TableUtils.facilityColumn('Facility'),
    TableUtils.raisedByColumn('Raised By'),
    TableUtils.statusColumn('Status'),
    TableUtils.priorityColumn('Priority'),
    TableUtils.assignedToColumn('Assigned To'),
    TableUtils.createdAtColumn('Created'),
    TableUtils.updatedAtColumn('Updated'),
    TableUtils.slaCountdownColumn('SLA'),
    TableUtils.pendingReasonColumn('Reason'),
    TableUtils.pendingForColumn('Pending for'),
    TableUtils.searchFieldColumn(),
  ];

  // Actions column — varies by variant. `queue`, `sla` and `admin` get none:
  // the whole row opens the ticket, so a View button would be a column of
  // buttons doing what clicking anywhere already does.
  if (variant === 'pending' && onResume && onChangeReason) {
    all.push(TableUtils.resumeActionColumn({ onResume, onChangeReason }));
  } else if (variant === 'my-tickets' && onRate) {
    all.push(TableUtils.rateAndCloseColumn({ onRate }));
  }

  return all;
}

// Variant → initial column visibility map.
// Hidden columns are still in the table (so search still works) but not rendered.
// Standard hidden columns across all variants: facility, sla_countdown, priority,
// updated_at, searchField.
// Variants may additionally hide columns that aren't relevant to their context.
// `pending_reason` and `pending_for` are meaningless off the Pending Work view —
// every other variant lists rows whose `paused_at` is null, where both would
// render an em dash in every cell.
export const VARIANT_COLUMN_VISIBILITY: Record<TicketTableVariant, Record<string, boolean>> = {
  // `description` is hidden: a ticket has no title of its own, so the Title
  // column already shows the service item and Description repeats it with
  // "reported by …" appended — "Repair paving or walkway" beside "Repair
  // paving or walkway reported b…", a whole column of restatement.
  queue: {
    searchField: false, facility: false, sla_countdown: false,
    priority: false, updated_at: false, raised_by: false, description: false,
    pending_reason: false, pending_for: false,
  },
  // `sla_countdown` is on here and nowhere else: it is the column this view
  // exists for. It was hidden in all six variants, so the SLA Tracking page
  // rendered an ordinary ticket list with no SLA on it.
  sla: {
    searchField: false, facility: false,
    priority: false, updated_at: false, raised_by: false,
    pending_reason: false, pending_for: false,
  },
  admin: {
    searchField: false, facility: false, sla_countdown: false,
    priority: false, updated_at: false,
    pending_reason: false, pending_for: false,
  },
  'my-tickets': {
    searchField: false, facility: false, sla_countdown: false,
    priority: false, updated_at: false, raised_by: false,
    pending_reason: false, pending_for: false,
  },
  // Everything here is on hold, so `status` is the same word on every row and
  // the SLA columns are frozen — none of the three tells the reader anything.
  // Facility stays visible: "which building" is half the chasing decision.
  pending: {
    searchField: false, status: false, sla_countdown: false,
    updated_at: false, raised_by: false, description: false,
  },
};
