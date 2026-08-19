import type { ColumnDef } from '@tanstack/react-table';
import type { Ticket, TicketTableVariant } from '@/types';
import * as TableUtils from './TableUtils';

/**
 * Configuration for which columns to include and customization
 */
export interface TicketColumnsConfig {
  role: 'admin' | 'user' | 'technician' | 'hos' | 'hod' | 'manager';
  setSelectedTicket?: (ticket: Ticket | null) => void;
  setIsTicketDialogOpen?: (open: boolean) => void;
}

/**
 * Generates standardized column definitions for ticket tables.
 * Provides consistent columns across Admin, User, and Technician dashboards.
 * 
 * @param config - Configuration for role-specific columns and actions
 * @returns Array of ColumnDef objects for TanStack Table
 * 
 * @example
 * // Admin columns with all actions
 * const columns = createTicketTableColumns({
 *   role: 'admin',
 *   setSelectedTicket,
 *   setIsTicketDialogOpen
 * });
 * 
 * @example
 * // Technician columns with workflow actions
 * const columns = createTicketTableColumns({
 *   role: 'technician',
 *   setSelectedTicket,
 *   setIsTicketDialogOpen,
 * });
 */
export function createTicketTableColumns(config: TicketColumnsConfig): ColumnDef<Ticket>[] {
  const {
    role,
    setSelectedTicket,
    setIsTicketDialogOpen,
  } = config;

  const columns: ColumnDef<Ticket>[] = [
    TableUtils.ticketNoColumn('Ticket ID'),
    TableUtils.ticketTitleColumn('Title'),
    TableUtils.descriptionColumn('Description'),
    TableUtils.facilityColumn('Facility'),
    TableUtils.tradeColumn('Trade'),
    TableUtils.raisedByColumn('Raised By'),
    TableUtils.statusColumn('Status'),
    TableUtils.createdAtColumn('Created At'),
    TableUtils.assignedToColumn('Assigned To'),
    TableUtils.updatedAtColumn('Updated At'),
    TableUtils.searchFieldColumn('Search Field'),
  ];

  // Add view button column for technicians and management roles
  const rolesWithViewButton = ['technician', 'hos', 'hod', 'manager'];
  if (rolesWithViewButton.includes(role) && setSelectedTicket && setIsTicketDialogOpen) {
    columns.push(
      TableUtils.technicianViewColumn({
        setSelectedTicket,
        setIsTicketDialogOpen,
      })
    );
  }

  return columns;
}

// ─── Variant-based column factory ────────────────────────────────────────────
// Used by TicketTable (src/components/shared/ticket/TicketTable.tsx).
// Each variant returns only the columns relevant to that view.
// Column visibility is additionally controlled by TicketColumnVisibility.

export interface VariantColumnsConfig {
  variant: TicketTableVariant;
  setSelectedTicket?: (ticket: Ticket | null) => void;
  setIsTicketDialogOpen?: (open: boolean) => void;
  onRate?: (ticket: Ticket) => void;
  /** 'pending' variant — clear the hold, or re-code it without clearing it. */
  onResume?: (ticket: Ticket) => void;
  onChangeReason?: (ticket: Ticket) => void;
}

export function createVariantColumns(config: VariantColumnsConfig): ColumnDef<Ticket>[] {
  const {
    variant,
    setSelectedTicket,
    setIsTicketDialogOpen,
    onRate,
    onResume,
    onChangeReason,
  } = config;

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
    TableUtils.dueDateColumn('Due By'),
    TableUtils.slaCountdownColumn('SLA'),
    TableUtils.pendingReasonColumn('Reason'),
    TableUtils.pendingForColumn('Pending for'),
    TableUtils.searchFieldColumn(),
  ];

  // Actions column — varies by variant
  if (variant === 'pending' && onResume && onChangeReason) {
    all.push(TableUtils.resumeActionColumn({ onResume, onChangeReason }));
  } else if (variant === 'my-tickets' && onRate) {
    all.push(TableUtils.rateAndCloseColumn({ onRate }));
  } else if (['queue', 'admin'].includes(variant) && setSelectedTicket && setIsTicketDialogOpen) {
    all.push(TableUtils.technicianViewColumn({ setSelectedTicket, setIsTicketDialogOpen }));
  }

  return all;
}

// Variant → initial column visibility map.
// Hidden columns are still in the table (so search still works) but not rendered.
// Standard hidden columns across all variants: facility, resolution_due_at, sla_countdown,
// priority, updated_at, searchField.
// Note: dueDateColumn has no explicit `id`, so its column id is its accessorKey,
// "resolution_due_at" — not "due_date". (Previously this map used the wrong key and the
// Due By column was never actually hidden.)
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
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false, raised_by: false, description: false,
    pending_reason: false, pending_for: false,
  },
  compact: {
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false,
    ticket_no: false, tradeName: false, raised_by: false, assigned_to: false, created_at: false,
    rate_actions: false, pending_reason: false, pending_for: false,
  },
  sla: {
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false, raised_by: false, rate_actions: false,
    pending_reason: false, pending_for: false,
  },
  admin: {
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false,
    pending_reason: false, pending_for: false,
  },
  'my-tickets': {
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false, raised_by: false, actions: false,
    pending_reason: false, pending_for: false,
  },
  // Everything here is on hold, so `status` is the same word on every row and
  // the SLA columns are frozen — none of the three tells the reader anything.
  // Facility stays visible: "which building" is half the chasing decision.
  pending: {
    searchField: false, status: false, resolution_due_at: false, sla_countdown: false,
    updated_at: false, raised_by: false, description: false, rate_actions: false,
    actions: false,
  },
};
