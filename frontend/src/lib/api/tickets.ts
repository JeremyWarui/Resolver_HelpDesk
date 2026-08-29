import apiClient, { type Page } from './client';
import type {
  AssignedUser,
  Ticket,
  TicketsResponse,
  CreateTicketPayload,
  TicketsParams,
  TicketTimelineEvent,
} from '@/types';

/** The comment and log feeds are cursor-paged, so `count` comes back null. */
export type Feed<T> = Page<T>;

export interface TicketLog {
  id: number;
  actor: { id: number; username: string; full_name: string } | null;
  event_type: string;
  from_value: string;
  to_value: string;
  reason: string;
  level_user: { id: number; username: string; full_name: string } | null;
  created_at: string;
}

export interface TicketComment {
  id: number;
  author: { id: number; username: string; full_name: string };
  body: string;
  created_at: string;
}

// ── List & detail ─────────────────────────────────────────────────────────────

export async function getTickets(params?: TicketsParams): Promise<TicketsResponse> {
  const { data } = await apiClient.get<TicketsResponse>('/tickets/', { params });
  return data;
}

// ── Scoped filter options ───────────────────────────────────────────────────

export interface TicketFilterOption {
  id: number;
  name: string;
}

/** A hold reason, as the server defines it. */
export interface PendingReasonOption {
  value: string;
  label: string;
}

export interface TicketFilterOptions {
  campuses: TicketFilterOption[];
  trades: TicketFilterOption[];
  technicians: TicketFilterOption[];
  requesters: TicketFilterOption[];
  /** The hold vocabulary, served here so the client keeps no copy of its own. */
  pending_reasons: PendingReasonOption[];
}

/**
 * What the tickets-table dropdowns may offer, built from the caller's own
 * scoped tickets — so an option can never come back empty or name someone
 * they cannot see.
 */
export async function getTicketFilterOptions(): Promise<TicketFilterOptions> {
  const { data } = await apiClient.get<TicketFilterOptions>('/tickets/filter-options/');
  return data;
}

export async function getTicketById(id: number): Promise<Ticket> {
  const { data } = await apiClient.get<Ticket>(`/tickets/${id}/`);
  return data;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  const { data } = await apiClient.post<Ticket>('/tickets/', payload);
  return data;
}

// ── Actions ───────────────────────────────────────────────────────────────────

/** Assignment is also where priority is decided.
 *
 *  A ticket opens at Low because the requester should not be grading their own
 *  urgency. The HOS has read it and knows the section's workload, so they set
 *  the real priority as they hand it out. Omit it to leave the ticket as it is
 *  — reassignment is not necessarily a re-judgement. */
/**
 * `note` is the HOS's handover message to the technician. It is stored on the
 * `assigned` log row, so it appears in the timeline rather than overwriting
 * anything on the ticket. Blank is omitted rather than sent as "" — an empty
 * note should leave no trace in the audit log at all.
 */
export async function assignTicket(
  id: number,
  technicianId: number,
  priorityId?: number,
  note?: string
): Promise<Ticket> {
  const trimmed = note?.trim();
  const { data } = await apiClient.post<Ticket>(`/tickets/${id}/assign/`, {
    assigned_to: technicianId,
    ...(priorityId != null ? { priority: priorityId } : {}),
    ...(trimmed ? { note: trimmed } : {}),
  });
  return data;
}

// ── Status update ─────────────────────────────────────────────────────────────

export async function updateTicketStatus(
  id: number,
  status: string,
  reason: string,
  /** Required by the server when `status` is 'pending'. */
  pendingReason?: string,
  pendingReasonNote?: string,
): Promise<Ticket> {
  const { data } = await apiClient.post<Ticket>(`/tickets/${id}/status/`, {
    status,
    reason,
    pending_reason: pendingReason ?? '',
    pending_reason_note: pendingReasonNote ?? '',
  });
  return data;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(
  ticketId: number,
  cursor?: string | null
): Promise<Feed<TicketComment>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await apiClient.get<Feed<TicketComment>>(
    `/tickets/${ticketId}/comments/`,
    { params }
  );
  return data;
}

export async function addComment(
  ticketId: number,
  body: string
): Promise<TicketComment> {
  const { data } = await apiClient.post<TicketComment>(
    `/tickets/${ticketId}/comments/`,
    { body }
  );
  return data;
}

// ── Feedback ──────────────────────────────────────────────────────────────────

export async function addFeedback(
  ticketId: number,
  rating: number,
  comment?: string
): Promise<Ticket> {
  const { data } = await apiClient.post<Ticket>(`/tickets/${ticketId}/feedback/`, {
    rating,
    comment,
  });
  return data;
}

// ── Timeline (merged logs + comments) ────────────────────────────────────────
//
// Fetches TicketLog and TicketComment in parallel and merges them into a unified
// TicketTimelineEvent[] sorted ascending by created_at.
//
// The two legs have different audiences. The log is the trail of what happened
// to the ticket and its raiser may read it; comments are the staff working log
// and the raiser is refused. So the comment leg degrades to [] rather than
// rejecting — under Promise.all a 403 there would take the whole timeline with
// it, and the requester would be told nothing at all about their own ticket.

export async function getTicketTimeline(ticketId: number): Promise<TicketTimelineEvent[]> {
  const [logsRes, commentsRes] = await Promise.all([
    apiClient
      .get<Feed<TicketLog> | TicketLog[]>(`/tickets/${ticketId}/logs/`)
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data as Feed<TicketLog>).results ?? [])),
    apiClient
      .get<Feed<TicketComment> | TicketComment[]>(`/tickets/${ticketId}/comments/`)
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data as Feed<TicketComment>).results ?? []))
      .catch(() => [] as TicketComment[]),
  ]);

  const logEvents: TicketTimelineEvent[] = (logsRes as TicketLog[]).map((log) => ({
    id: `log-${log.id}`,
    event_type: (log.event_type as TicketTimelineEvent['event_type']) ?? 'status_changed',
    actor: log.actor ?? undefined,
    // note = the human-entered reason only (pending reason, resolution note…).
    // from/to stay in data — falling back to to_value here rendered raw values
    // (statuses, comment pks) as if they were notes.
    note: log.reason || undefined,
    data: {
      from: log.from_value,
      to: log.to_value,
      level_user: log.level_user,
    },
    created_at: log.created_at,
  }));

  const commentEvents: TicketTimelineEvent[] = (commentsRes as TicketComment[]).map((c) => ({
    id: `comment-${c.id}`,
    event_type: 'comment' as TicketTimelineEvent['event_type'],
    actor: c.author,
    note: c.body,
    created_at: c.created_at,
  }));

  return [...logEvents, ...commentEvents].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

// ── Convenience status transitions ───────────────────────────────────────────

export async function closeTicket(id: number): Promise<Ticket> {
  return updateTicketStatus(id, 'closed', '');
}

// Reopen restarts the lifecycle at 'open' (unassigned, fresh SLA clock) —
// mirrors the backend ALLOWED map (resolved/closed → open).
export async function reopenTicket(id: number): Promise<Ticket> {
  return updateTicketStatus(id, 'open', '');
}

// Technician self-assigns an unassigned open ticket in their section.
export async function claimTicket(id: number): Promise<Ticket> {
  const { data } = await apiClient.post<Ticket>(`/tickets/${id}/claim/`);
  return data;
}

// ── Attachments ───────────────────────────────────────────────────────────────

export interface TicketAttachmentRow {
  id: number;
  original_name: string;
  mime_type: string;
  stored_size: number;
  url: string;
  uploaded_by: AssignedUser | null;
  created_at: string;
}

export async function getAttachments(ticketId: number): Promise<TicketAttachmentRow[]> {
  const { data } = await apiClient.get<TicketAttachmentRow[]>(`/tickets/${ticketId}/attachments/`);
  return Array.isArray(data) ? data : [];
}

export async function uploadAttachments(ticketId: number, files: File[]): Promise<void> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  await apiClient.post(`/tickets/${ticketId}/attachments/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/** A rated ticket, as the Feedback tab lists it. Scoped server-side. */
export interface TicketFeedbackRow {
  id: number;
  ticket_no: string;
  service_item: string;
  campus: string;
  trade: string;
  assigned_to: AssignedUser | null;
  resolved_at: string | null;
  rating: number;
  comment: string;
  /** When it was rated. */
  created_at: string;
}

export interface TicketFeedbackResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: TicketFeedbackRow[];
}

export async function getFeedback(): Promise<TicketFeedbackResponse> {
  const { data } = await apiClient.get<TicketFeedbackResponse>('/tickets/feedback/');
  return data;
}

