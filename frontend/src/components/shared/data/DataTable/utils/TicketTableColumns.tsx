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
  ];

  // Actions column, by variant. `queue` and `admin` get none: the whole row
  // opens the ticket.
  if (variant === 'pending' && onResume && onChangeReason) {
    all.push(TableUtils.resumeActionColumn({ onResume, onChangeReason }));
  } else if (variant === 'my-tickets' && onRate) {
    all.push(TableUtils.rateAndCloseColumn({ onRate }));
  }

  return all;
}

// Variant → initial column visibility map.
// Hidden columns are still in the table, and the Columns menu turns them on.
// `pending_reason` and `pending_for` belong to the Pending Work view; elsewhere
// most rows are not on hold, and both would read as an em dash.
export const VARIANT_COLUMN_VISIBILITY: Record<TicketTableVariant, Record<string, boolean>> = {
  // `description` is hidden: it repeats the service item the Title column
  // already shows, with "reported by …" appended.
  queue: {
    facility: false, sla_countdown: false,
    priority: false, updated_at: false, raised_by: false, description: false,
    pending_reason: false, pending_for: false,
  },
  admin: {
    facility: false, sla_countdown: false,
    priority: false, updated_at: false,
    pending_reason: false, pending_for: false,
  },
  // The requester wrote the description, so it is hidden here too; where the
  // job is takes its place.
  'my-tickets': {
    sla_countdown: false, description: false,
    priority: false, updated_at: false, raised_by: false,
    pending_reason: false, pending_for: false,
  },
  // Everything here is on hold, so `status` is the same word on every row and
  // the SLA columns are frozen — none of the three tells the reader anything.
  // Facility stays visible: "which building" is half the chasing decision.
  pending: {
    status: false, sla_countdown: false,
    updated_at: false, raised_by: false, description: false,
  },
  // Every row is the technician's, so who has it says nothing; how long is
  // left is what sets the order of work.
  'my-jobs': {
    facility: false, assigned_to: false, description: false,
    updated_at: false, pending_reason: false, pending_for: false,
  },
  'section': {
    facility: false, description: false,
    updated_at: false, pending_reason: false, pending_for: false,
  },
};
