/**
 * Shared constants for the Resolver ticketing system
 */

import type { FilterPill, Ticket } from '@/types';

// Status display names.
//
// `pending` reads "On Hold" on every surface.
export const STATUS_LABELS: Record<Ticket['status'], string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending: 'On Hold',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** Each status's --status-* token base; index.css holds its -bg, -text and
 *  -border. The status pill and the progress tracker both colour from this. */
export const STATUS_TOKEN: Record<Ticket['status'], string> = {
  open:        '--status-open',
  assigned:    '--status-assigned',
  in_progress: '--status-progress',
  pending:     '--status-pending',
  resolved:    '--status-resolved',
  closed:      '--status-closed',
};

// All statuses in order
export const ALL_TICKET_STATUSES: Ticket['status'][] = [
  'open',
  'assigned',
  'in_progress',
  'pending',
  'resolved',
  'closed',
];

// The hold vocabulary is not declared here. It is defined in
// `apps/tickets/constants.py` and arrives with `GET /tickets/filter-options/`;
// read it with `useTicketFilterOptions()`.

// The one frontend mirror of the backend lifecycle map
// (`apps/tickets/lifecycle.py::ALLOWED`). Keep the two in step. `open` is the
// unassigned state and the way out of it is claim, not a status change.
export const VALID_NEXT_STATUS: Partial<Record<Ticket['status'], Ticket['status'][]>> = {
  assigned: ['in_progress'],
  in_progress: ['pending', 'resolved'],
  pending: ['in_progress', 'resolved'],
};

/** When the requester may read their ticket's comments. Mirrors
 *  `REQUESTER_COMMENT_STATUSES` in `apps/tickets/constants.py`. */
export const REQUESTER_COMMENT_STATUSES: Ticket['status'][] = ['pending', 'resolved'];

/** A job a technician holds and is working: what a card offers a next step on. */
export const WORKING_STATUSES: Ticket['status'][] = ['assigned', 'in_progress'];

/** Held by a technician and not yet settled. Mirrors the server's
 *  ACTIVE_STATUSES less `open`, which is by definition held by nobody. */
export const HELD_STATUSES: Ticket['status'][] = ['assigned', 'in_progress', 'pending'];

/** Levels a ticket has escalated to. Mirrors ESCALATED_LEVELS in
 *  `apps/tickets/constants.py`. */
export const ESCALATED_LEVELS: NonNullable<Ticket['current_level']>[] = ['hos', 'hod'];

/**
 * A status filter row: "All" and then the statuses a page offers, labelled
 * from `STATUS_LABELS`.
 */
export function statusPills(statuses: Ticket['status'][]): FilterPill[] {
  return [
    { key: 'all', label: 'All' },
    ...statuses.map((status) => ({ key: status, label: STATUS_LABELS[status], variant: status })),
  ];
}
