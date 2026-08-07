import type { NestedRef } from './section.types';

export interface Priority {
  id: number;
  name: string;
  rank: number;
  response_minutes: number;
  resolution_minutes: number;
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
  /** Specialty child SectionType (R18) — e.g. "Plumbing" within a "Maintenance"
   *  section. Null when the routed section has no specialty children. Pool-
   *  filtering/display only — never an escalation or scope boundary. */
  specialty?: { id: number; name: string } | null;
  raised_by: string | { id: number; username: string; full_name: string };
  raised_by_id: number; // user ID — use this for ownership checks, not raised_by
  assigned_to: AssignedUser | null;

  // SLA timestamps (server-owned; paused_at non-null means SLA frozen)
  response_due_at?: string | null;
  resolution_due_at?: string | null;
  paused_at?: string | null;
  accumulated_pause?: string;

  // Location (present when category.location_details is true)
  location?: TicketLocation | null;

  // Timestamps
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;

  // Pending reason (required when transitioning to 'pending')
  pending_reason?: string | null;
  pending_comment?: string | null;
  organizational_path?: OrganizationalPath | null;

  // Available technicians (only for roles that can assign)
  available_technicians?: Array<{ id: number; username: string; full_name: string }>;

  // Nested data (detail view only)
  comments?: Comment[];
  feedback?: Feedback | null;
  service_item?: {
    id: number;
    name: string;
    category_name: string;
  } | null;
}

export interface TicketsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Ticket[];
}

// Canonical create payload — server resolves section + priority (R6/R7)
export interface CreateTicketPayload {
  service_item: number;
  description: string;
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
