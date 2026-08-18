import apiClient from './client';
import type {
  Ticket,
  TicketsResponse,
  CreateTicketPayload,
  UpdateTicketPayload,
  TicketsParams,
  TicketTimelineEvent,
} from '@/types';

// ── Cursor-pagination types ───────────────────────────────────────────────────

export interface CursorMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
}

export interface CursorResponse<T> {
  results: T[];
  meta: CursorMeta;
}

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
  visibility: 'public' | 'internal';
  created_at: string;
  updated_at: string;
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
  sections: TicketFilterOption[];
  /** Trades — Plumbing, Electrical, Carpentry, … */
  sub_sections: TicketFilterOption[];
  technicians: TicketFilterOption[];
  requesters: TicketFilterOption[];
  /**
   * The hold vocabulary. Static rather than scoped, unlike the lists above,
   * but served here so the client never keeps its own copy — the last one
   * drifted against a backend field that did not exist.
   */
  pending_reasons: PendingReasonOption[];
}

/**
 * Sections / trades / technicians / requesters that appear in the caller's
 * role-scoped tickets — used to populate the tickets-table filter dropdowns.
 * Scoped server-side by JWT role (admin = all, manager = department, hod/hos =
 * their sections), so the options always match what the filters can return.
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

// ── Mutate ────────────────────────────────────────────────────────────────────

export async function updateTicket(
  id: number,
  payload: UpdateTicketPayload
): Promise<Ticket> {
  const { data } = await apiClient.patch<Ticket>(`/tickets/${id}/`, payload);
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
): Promise<CursorResponse<TicketComment>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await apiClient.get<CursorResponse<TicketComment>>(
    `/tickets/${ticketId}/comments/`,
    { params }
  );
  return data;
}

export async function addComment(
  ticketId: number,
  body: string,
  visibility: 'public' | 'internal' = 'public'
): Promise<TicketComment> {
  const { data } = await apiClient.post<TicketComment>(
    `/tickets/${ticketId}/comments/`,
    { body, visibility }
  );
  return data;
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export async function getLogs(
  ticketId: number,
  cursor?: string | null
): Promise<CursorResponse<TicketLog>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await apiClient.get<CursorResponse<TicketLog>>(
    `/tickets/${ticketId}/logs/`,
    { params }
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
// Internal comments are included here; callers (TicketTimeline) filter by role.

export async function getTicketTimeline(ticketId: number): Promise<TicketTimelineEvent[]> {
  const [logsRes, commentsRes] = await Promise.all([
    apiClient
      .get<CursorResponse<TicketLog> | TicketLog[]>(`/tickets/${ticketId}/logs/`)
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data as CursorResponse<TicketLog>).results ?? [])),
    apiClient
      .get<CursorResponse<TicketComment> | TicketComment[]>(`/tickets/${ticketId}/comments/`)
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data as CursorResponse<TicketComment>).results ?? [])),
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
    data: { visibility: c.visibility },
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

export async function uploadAttachments(ticketId: number, files: File[]): Promise<void> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  await apiClient.post(`/tickets/${ticketId}/attachments/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

// ── Feedback list (role-scoped: technician=own, HOS/HOD/Manager/Admin=full scope) ──

export interface TicketFeedbackRow {
  id: number;
  ticket_no: string;
  service_item: string;
  section: string;
  assigned_to: { id: number; username: string; first_name: string; last_name: string; full_name: string } | null;
  resolved_at: string | null;
  rating: number;
  comment: string;
  created_at: string;
}

export interface TicketFeedbackResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: TicketFeedbackRow[];
}

export interface TicketFeedbackParams {
  rating?: number;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export async function getFeedback(params?: TicketFeedbackParams): Promise<TicketFeedbackResponse> {
  const { data } = await apiClient.get<TicketFeedbackResponse>('/tickets/feedback/', { params });
  return data;
}

// ── Default export ────────────────────────────────────────────────────────────

const ticketsService = {
  getTickets,
  getTicketFilterOptions,
  getTicketById,
  createTicket,
  updateTicket,
  assignTicket,
  updateTicketStatus,
  addFeedback,
  getComments,
  addComment,
  getLogs,
  uploadAttachments,
  closeTicket,
  reopenTicket,
  claimTicket,
  getFeedback,
};

export default ticketsService;
