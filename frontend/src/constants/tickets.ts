/**
 * Shared constants for the Resolver ticketing system
 */

import type { FilterPill, Ticket } from '@/types';

// Status display names.
//
// `pending` reads "On Hold" because that is what every other surface already
// called it — the technician's filter pills, the whole mobile list and detail,
// My Tickets, and the Resume Work modal. Only this map said "Pending", and it
// is the map behind `StatusBadge`, so one ticket showed both words at once:
// an "On Hold" pill directly above a row badged "Pending".
export const STATUS_LABELS: Record<Ticket['status'], string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending: 'On Hold',
  resolved: 'Resolved',
  closed: 'Closed',
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

/**
 * A status filter row: "All" and then the statuses a page offers.
 *
 * Derived rather than retyped. Three pages wrote their own list, so a status
 * read "On Hold" on one and "Pending" on another, and each carried its own
 * colour variant beside a row badged from `STATUS_LABELS`.
 */
export function statusPills(statuses: Ticket['status'][]): FilterPill[] {
  return [
    { key: 'all', label: 'All' },
    ...statuses.map((status) => ({ key: status, label: STATUS_LABELS[status], variant: status })),
  ];
}
