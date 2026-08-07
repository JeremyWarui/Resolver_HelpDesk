import type { ColumnDef } from '@tanstack/react-table';
import type { Ticket, Technician, TicketTableVariant } from '@/types';
import * as TableUtils from './TableUtils';

/**
 * Configuration for which columns to include and customization
 */
export interface TicketColumnsConfig {
  role: 'admin' | 'user' | 'technician' | 'hos' | 'hod' | 'manager';
  setSelectedTicket?: (ticket: Ticket | null) => void;
  setIsTicketDialogOpen?: (open: boolean) => void;
  technicians?: Technician[];
  allStatuses?: string[];
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
    TableUtils.sectionColumn('Section'),
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
}

export function createVariantColumns(config: VariantColumnsConfig): ColumnDef<Ticket>[] {
  const { variant, setSelectedTicket, setIsTicketDialogOpen, onRate } = config;

  // Shared pool — all possible columns
  const all: ColumnDef<Ticket>[] = [
    TableUtils.ticketNoColumn('ID'),
    TableUtils.ticketTitleColumn('Title'),
    TableUtils.descriptionColumn('Description'),
    TableUtils.sectionColumn('Section'),
    TableUtils.facilityColumn('Facility'),
    TableUtils.raisedByColumn('Raised By'),
    TableUtils.statusColumn('Status'),
    TableUtils.priorityColumn('Priority'),
    TableUtils.assignedToColumn('Assigned To'),
    TableUtils.createdAtColumn('Created'),
    TableUtils.updatedAtColumn('Updated'),
    TableUtils.dueDateColumn('Due By'),
    TableUtils.slaCountdownColumn('SLA'),
    TableUtils.searchFieldColumn(),
  ];

  // Actions column — varies by variant
  if (variant === 'my-tickets' && onRate) {
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
export const VARIANT_COLUMN_VISIBILITY: Record<TicketTableVariant, Record<string, boolean>> = {
  queue: {
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false, raised_by: false,
  },
  compact: {
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false,
    ticket_no: false, sectionName: false, raised_by: false, assigned_to: false, created_at: false,
    rate_actions: false,
  },
  sla: {
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false, raised_by: false, rate_actions: false,
  },
  admin: {
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false,
  },
  'my-tickets': {
    searchField: false, facility: false, resolution_due_at: false, sla_countdown: false,
    priority: false, updated_at: false, raised_by: false, actions: false,
  },
};
