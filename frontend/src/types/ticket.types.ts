/** A priority level with its two SLA targets and its two escalation thresholds. */
export interface Priority {
  id: number;
  name: string;
  /** 1 is lowest, and what every ticket opens at. */
  rank: number;
  response_minutes: number;
  resolution_minutes: number;
  escalate_to_hos_minutes: number;
  escalate_to_hod_minutes: number;
}

/** The campus a ticket belongs to — the requester's own, never chosen. */
export interface CampusRef {
  id: number;
  name: string;
  code: string;
}

export interface TradeRef {
  id: number;
  name: string;
  code: string;
}

export interface TicketLocation {
  facility_type: { id: number; name: string; code: string };
  facility: { id: number; name: string } | null;
  /** Where in the facility, in the requester's words. */
  detail: string;
}

/** How a person appears inside a ticket payload. `full_name` is never blank. */
export interface AssignedUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
}

export interface Attachment {
  id: number;
  filename: string;
  url: string;
  mime_type: string;
  size_bytes: number;
}

/** The nested `feedback` on ticket detail. Null until the requester rates it. */
export interface Feedback {
  rating: number;
  comment: string;
  created_at: string;
}

export interface Ticket {
  id: number;
  ticket_no: string;
  description: string;
  status: 'open' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'closed';
  priority?: Priority;
  current_level?: 'technician' | 'hos' | 'hod';

  // Write-only IDs (sent on create/update)
  assigned_to_id?: number | null;

  // Read-only nested objects
  /** The requester's campus. Derived server-side, never chosen. */
  requester_campus: CampusRef;
  /** The trade that owns the work — Plumbing, Electrical, and so on. Derived
   *  server-side from the chosen service item; together with `requester_campus`
   *  it is the pair a technician is scoped to. */
  trade: TradeRef;
  raised_by: AssignedUser;
  assigned_to: AssignedUser | null;

  // SLA timestamps (server-owned; paused_at non-null means SLA frozen, and is
  // on list rows too, so a held list can say how long)
  response_due_at?: string | null;
  resolution_due_at?: string | null;
  paused_at?: string | null;
  accumulated_pause?: string;

  /** Detail shape only: the caller sees this ticket only as its requester,
   *  not as staff who also raised it. */
  viewer_is_requester?: boolean;
  /** The facility's name, on a list row. */
  facility?: string;
  /** The full location, on the detail shape. */
  location?: TicketLocation | null;

  // Timestamps
  created_at: string;
  updated_at: string;
  /** When work finished. Settled SLA outcomes are judged against this, not the clock. */
  resolved_at?: string | null;
  closed_at?: string | null;

  // Why the ticket is on hold. Set on the way into 'pending', cleared on the
  // way out, so a non-empty `pending_reason` and a running status cannot
  // disagree. `pending_reason_display` is the label, resolved server-side.
  pending_reason?: string | null;
  pending_reason_display?: string | null;
  pending_reason_note?: string | null;

  /** Whether the requester has rated it. A flag, present on list rows; the
   *  rating object itself stays on the detail view. */
  /** Sent by the list serializer. Use this on table rows. */
  has_feedback?: boolean;

  /** Past its resolution deadline right now, decided server-side. A paused
   *  ticket is never breaching (R9), so reading this rather than comparing
   *  `resolution_due_at` to the clock is what keeps a row's colour agreeing
   *  with the badge on the ticket and the count on the dashboard. */
  is_breaching?: boolean;

  /** Detail only: the server's verdict on the resolution target, from
   *  `tickets/sla.py`. Null while live and on time, or with no target. */
  sla_outcome?: 'met' | 'missed' | 'overdue' | null;

  /** Detail endpoint only. On a list row this is always undefined — read
   *  `has_feedback` there instead. */
  feedback?: Feedback | null;
  /** Detail only. Deliberately absent from the list serializer — a phone
   *  number is for the technician who opened the ticket, not for anyone
   *  scrolling a table. Stored E.164, rendered locally. */
  contact_phone?: string;
  service_item?: {
    id: number;
    name: string;
    trade: TradeRef;
  } | null;
}

export interface TicketsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Ticket[];
}

// The create payload. The server derives the trade, the campus and the priority
// from the service item and the requester.
export interface CreateTicketPayload {
  service_item: number;
  description: string;
  /** Left out, the requester's own number is used. */
  contact_phone?: string;
  /** The facility names its own type, so only its id is sent. */
  location: {
    facility: number;
    detail: string;
  };
}

export interface UpdateTicketPayload {
  description?: string;
  status?: Ticket['status'];
  assigned_to_id?: number | null;
  pending_reason?: string | null;
  pending_reason_note?: string | null;
}

// Params for GET /tickets/ — role scoping enforced server-side from JWT.
export interface TicketsParams {
  status?: string;
  priority?: string;
  search?: string;
  page?: number;
  page_size?: number;
  cursor?: string;
  mine?: 1;          // My Requests context: only tickets raised_by == self
  ordering?: string;
  // Server-side filters (narrow the role-scoped queryset; never widen scope)
  campus?: number;
  trade?: number;   // trade — Plumbing, Electrical, …
  current_level?: 'technician' | 'hos' | 'hod';
  /** '1' returns everything above the technician, in one request. */
  escalated?: '1';
  /** '1' returns live work past its resolution target — the same predicate as
   *  analytics' `breached`. Settled and paused tickets are never overdue. */
  overdue?: '1';
  assigned_to?: number;  // technician (assignee) user id
  raised_by?: number;    // requester user id
}

/** A `TicketLog.event_type`. */
export type TicketEventType =
  | 'created' | 'assigned' | 'reassigned' | 'status_changed'
  | 'comment_added' | 'resolved' | 'closed'
  | 'reopened' | 'rated' | 'escalated' | 'priority_changed';

/** One row of the trail. A system action has no actor, and a person
 *  registered by email alone has no name yet, so both are optional. */
export interface TicketTimelineEvent {
  id: number | string;
  event_type: TicketEventType;
  actor?: { id: number; username: string; full_name?: string | null };
  note?: string;
  data?: Record<string, unknown>;
  created_at: string;
}

// ─── The escalation check (GET /escalations/, admin only) ───────────────────

/** One pass of the escalation check: the server's task (`scheduled`), an admin's
 *  Run now (`started_by`), or neither, a run typed at the command line. */
export interface EscalationRun {
  id: number;
  scheduled: boolean;
  /** `did_not_finish`: stopped with no error, as a task killed at its time limit does. */
  outcome: 'finished' | 'failed' | 'running' | 'did_not_finish';
  started_at: string;
  finished_at: string | null;
  started_by: string | null;
  to_hos: number;
  to_hod: number;
  seconds: number | null;
  error: string;
}

export interface EscalationStatus {
  /** Scheduled runs only. `never`: none has run. `stale`: none has started within
   *  `stale_after_minutes`. `failing`: runs start but error or do not finish. */
  state: 'never' | 'failing' | 'stale' | 'running';
  interval_minutes: number;
  stale_after_minutes: number;
  last_run: EscalationRun | null;
  /** What a run now would move. */
  due: { hos: number; hod: number };
  runs: EscalationRun[];
}

/** A ticket the check would move, as the preview names it. */
export interface EscalationMove {
  id: number;
  ticket_no: string;
  campus: string;
  from_level: 'technician' | 'hos';
  to_level: 'hos' | 'hod';
}
