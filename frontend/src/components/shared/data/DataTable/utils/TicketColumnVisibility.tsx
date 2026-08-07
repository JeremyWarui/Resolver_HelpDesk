import type { VisibilityState } from '@tanstack/react-table';

/**
 * Configuration for ticket table column visibility
 */
export interface ColumnVisibilityConfig {
  role?: 'admin' | 'user' | 'technician' | 'hos' | 'hod' | 'manager';
  customVisibility?: Partial<VisibilityState>;
}

/**
 * Generates standardized column visibility configuration for ticket tables.
 * Provides sensible defaults based on role while allowing customization.
 * 
 * @param config - Configuration for role and visibility preferences
 * @returns VisibilityState object for TanStack Table
 * 
 * @example
 * const visibility = createTicketColumnVisibility({ role: 'admin' });
 * 
 * @example
 * const visibility = createTicketColumnVisibility({
 *   role: 'user',
 *   hideDescription: false, // Show description
 *   customVisibility: { priority: true } // Add custom column
 * });
 */
export function createTicketColumnVisibility(
  config: ColumnVisibilityConfig
): VisibilityState {
  const { customVisibility = {} } = config;

  // Standard visible columns for all roles and table types.
  // facility, due_date, sla_countdown, priority are optional (hidden by default).
  const base: VisibilityState = {
    searchField: false,
    ticket_no: true,
    title: true,
    description: true,
    sectionName: true,
    raised_by: true,
    status: true,
    assigned_to: true,
    created_at: true,
    updated_at: true,
    facility: false,
    due_date: false,
    sla_countdown: false,
    priority: false,
    actions: true,
  };

  const result: VisibilityState = { ...base };
  for (const [key, value] of Object.entries(customVisibility)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}
