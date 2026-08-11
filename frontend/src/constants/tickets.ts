/**
 * Shared constants for the Resolver ticketing system
 */

import type { Ticket } from '@/types';

// Ticket status definitions — canonical 6 values only (SoT §4.1)
export const TICKET_STATUSES = {
  OPEN: 'open',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const;

export type TicketStatus = typeof TICKET_STATUSES[keyof typeof TICKET_STATUSES];

// Status display names
export const STATUS_LABELS: Record<Ticket['status'], string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  pending: 'Pending',
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

// Limited statuses for assignment mode (only active states)
export const ASSIGNMENT_STATUSES: Ticket['status'][] = [
  'open',
  'assigned',
  'in_progress',
];

// Active statuses (not resolved/closed)
export const ACTIVE_STATUSES: Ticket['status'][] = [
  'open',
  'assigned',
  'in_progress',
  'pending',
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
