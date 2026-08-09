import type { NestedRef } from './section.types';

export interface Priority {
  id: number;
  name: string;
  rank: number;
  response_minutes: number;
  resolution_minutes: number;
}

export interface SubSectionRef {
  id: number;
  name: string;
  code: string;
}

export interface TicketLocation {
  facility_type: { id: number; name: string; code: string };
  facility: { id: number; name: string } | null;
  values: Record<string, unknown>;
}

export interface AssignedUser {
  id: number;
  name?: string;
  full_name?: string;
  username?: string;
  role?: string;
}

export interface EscalationStatus {
  code: 'none' | 'hos' | 'hod' | 'manager' | 'unknown';
  label: string;
}

export interface OrganizationalPath {
  campus: NestedRef | null;
  department: NestedRef | null;
  section: NestedRef;
}

export interface Attachment {
  id: number;
  filename: string;
  url: string;
  mime_type: string;
  size_bytes: number;
}

export interface Comment {
  id: number;
  text: string;
  author: { id: number; username: string; full_name: string };
  created_at: string;
  attachments?: Attachment[];
}

// Shape of the nested read-only `feedback` on ticket detail
// (TicketFeedbackSerializer — null until the requester submits a rating).
export interface Feedback {
  id: number;
  rating: number;
  comment?: string;
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
  section_id?: number;
  assigned_to_id?: number | null;

  // Read-only nested objects
  section: NestedRef;
  /** The trade that owns the work — Plumbing, Electrical, and so on. Derived
   *  server-side from the chosen service item; together with `section` it is
   *  the pair a technician is scoped to. */
  sub_section: SubSectionRef;
  raised_by: string | { id: number; username: string; full_name: string };
  raised_by_id: number; // user ID — use this for ownership checks, not raised_by
  assigned_to: AssignedUser | null;

  // SLA timestamps (server-owned; paused_at non-null means SLA frozen)
  response_due_at?: string | null;
  resolution_due_at?: string | null;
  paused_at?: string | null;
  accumulated_pause?: string;

  // Location (present when the trade's location_details is true)
  location?: TicketLocation | null;

  // Timestamps
  created_at: string;
  updated_at: string;
  /** When work finished. Settled SLA outcomes are judged against this, not the clock. */
  resolved_at?: string | null;
  closed_at?: string | null;

  // Pending reason (required when transitioning to 'pending')
  pending_reason?: string | null;
  pending_comment?: string | null;
  organizational_path?: OrganizationalPath | null;

  // Available technicians (only for roles that can assign)
  available_technicians?: Array<{ id: number; username: string; full_name: string }>;

  /** Whether the requester has rated it. A flag, present on list rows; the
   *  rating object itself stays on the detail view. */
  has_feedback?: boolean;

  // Nested data (detail view only)
  comments?: Comment[];
  feedback?: Feedback | null;
  /** Detail only. Deliberately absent from the list serializer — a phone
   *  number is for the technician who opened the ticket, not for anyone
   *  scrolling a table. Stored E.164, rendered locally. */
  contact_phone?: string;
  service_item?: {
    id: number;
    name: string;
    sub_section: SubSectionRef;
  } | null;
}

export interface TicketsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Ticket[];
}

// Canonical create payload — the server derives section, trade and priority
// from the service item and the requester's own campus.
export interface CreateTicketPayload {
  service_item: number;
  description: string;
  /** Optional. Left out, the requester's own number is used. */
  contact_phone?: string;
  location?: {
    facility_type: number;
    facility?: number;
    values: Record<string, unknown>;
  };
}

export interface UpdateTicketPayload {
  title?: string;
  description?: string;
  section_id?: number;
  facility_id?: number;
  status?: Ticket['status'];
  assigned_to_id?: number | null;
  pending_reason?: string | null;
  pending_comment?: string | null;
}

export interface BulkStatusUpdatePayload {
  ticket_ids: number[];
  status: Ticket['status'];
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
  section?: number;
  sub_section?: number;   // trade — Plumbing, Electrical, …
  current_level?: 'technician' | 'hos' | 'hod';
  assigned_to?: number;  // technician (assignee) user id
  raised_by?: number;    // requester user id
}

export interface TicketTimelineEvent {
  id: number | string;
  event_type:
    | 'created' | 'assigned' | 'reassigned' | 'status_changed'
    | 'comment' | 'comment_added' | 'pending' | 'resolved' | 'closed'
    | 'reopened' | 'rated' | 'escalated' | 'priority_changed' | 'sla_breach';
  actor?: { id: number; username: string; full_name: string };
  note?: string;
  data?: Record<string, unknown>;
  created_at: string;
}
