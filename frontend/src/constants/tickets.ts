/**
 * Shared constants for the Resolver ticketing system
 */

import type { Ticket } from '@/types';

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

// The hold vocabulary is NOT declared here.
//
// It used to be — a `PENDING_REASON_CHOICES` array captioned "must match Django
// model exactly", against a Django model that had no such field. The modal read
// it, joined the code to the free-text note, and posted the result as one
// string, so nothing could ever count how much work was stopped or by what.
//
// It now lives in `apps/tickets/pending_reasons.py` and arrives over the wire
// from `GET /tickets/filter-options/`. Read it with `useTicketFilterOptions()`.
// A second copy here is the bug, not the convenience.

// The only frontend mirror of the backend lifecycle map
// (`apps/tickets/services/lifecycle.py::ALLOWED`). Keep the two in sync.
//
// There used to be a second, undeclared copy in the mobile shell, and it had
// drifted: it offered `open → in_progress`, which the backend refuses because
// `open` is the unassigned state and the hop out of it is `claim`. Deriving
// both surfaces from one map is what stops that recurring.
export const VALID_NEXT_STATUS: Partial<Record<Ticket['status'], Ticket['status'][]>> = {
  assigned: ['in_progress'],
  in_progress: ['pending', 'resolved'],
  pending: ['in_progress', 'resolved'],
};
