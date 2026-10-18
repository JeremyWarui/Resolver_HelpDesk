import apiClient, { fetchAll, type Page } from './client';
import type {
  AssignedUser,
  EscalationMove,
  EscalationRun,
  EscalationStatus,
  Ticket,
  CreateTicketPayload,
  TicketsParams,
  TicketTimelineEvent,
} from '@/types';

interface TicketLog {
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

export async function getTickets(params?: TicketsParams): Promise<Page<Ticket>> {
  const { data } = await apiClient.get<Page<Ticket>>('/tickets/', { params });
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

interface TicketFilterOptions {
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

/**
 * Assign a ticket, setting its priority as it is handed over. Omit `priorityId`
 * to leave the priority as it is.
 *
 * `note` is the HOS's handover message, stored on the `assigned` log row. A
 * blank note is left out, never sent as "".
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
): Promise<Page<TicketComment>> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await apiClient.get<Page<TicketComment>>(
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

/** What rating a ticket answers. Rating a resolved ticket closes it. */
interface FeedbackResult {
  rating: number;
  comment: string;
  created_at: string;
  status: Ticket['status'];
}

export async function addFeedback(
  ticketId: number,
  rating: number,
  comment?: string
): Promise<FeedbackResult> {
  const { data } = await apiClient.post<FeedbackResult>(`/tickets/${ticketId}/feedback/`, {
    rating,
    comment,
  });
  return data;
}

// ── Timeline ─────────────────────────────────────────────────────────────────
//
// The ticket's TicketLog rows, oldest first. Comments are not merged in: each
// one already has its `comment_added` row here, and the comment thread shows
// the text.

export async function getTicketTimeline(ticketId: number): Promise<TicketTimelineEvent[]> {
  // Every page: the trail is a ticket's whole history, and a busy one runs past the first.
  const logsRes = await fetchAll<TicketLog>(`/tickets/${ticketId}/logs/`);

  const logEvents: TicketTimelineEvent[] = logsRes.map((log) => ({
    id: `log-${log.id}`,
    event_type: (log.event_type as TicketTimelineEvent['event_type']) ?? 'status_changed',
    actor: log.actor ?? undefined,
    // note = the human-entered reason only (pending reason, resolution note…).
    // from/to stay in data: they hold raw values such as statuses and comment pks.
    note: log.reason || undefined,
    data: {
      from: log.from_value,
      to: log.to_value,
      level_user: log.level_user,
    },
    created_at: log.created_at,
  }));

  return logEvents.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

// ── Convenience status transitions ───────────────────────────────────────────

// Reopen restarts the lifecycle at 'open' (unassigned, fresh SLA clock) —
// mirrors the backend ALLOWED map (resolved/closed → open).
export async function reopenTicket(id: number): Promise<Ticket> {
  return updateTicketStatus(id, 'open', '');
}

/** The assignee starting a job: assigned to in progress, with a short note. */
export async function startWork(id: number): Promise<Ticket> {
  return updateTicketStatus(id, 'in_progress', 'Started work');
}

/** A technician takes an open, unassigned ticket in their scope, straight to in progress. */
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

/** A fixed span of rating dates, as ISO strings. Fixed so pages cannot drift. */
export interface FeedbackWindow {
  date_from: string;
  date_to: string;
}

/** One page of the window's ratings, newest first; `rating` narrows to one star. */
export async function getFeedback(
  window: FeedbackWindow,
  rating: number | null,
  page = 1,
): Promise<Page<TicketFeedbackRow>> {
  const { data } = await apiClient.get<Page<TicketFeedbackRow>>('/tickets/feedback/', {
    params: { ...window, page, ...(rating ? { rating } : {}) },
  });
  return data;
}

/** The period's figures, over every rating in it. */
interface FeedbackSummary {
  count: number;
  average: number | null;
  commented: number;
  /** Five stars down to one, always all five. */
  stars: { stars: number; count: number }[];
}

export async function getFeedbackSummary(window: FeedbackWindow): Promise<FeedbackSummary> {
  const { data } = await apiClient.get<FeedbackSummary>('/tickets/feedback/summary/', {
    params: window,
  });
  return data;
}

/** Whether the scheduled escalation check is alive, what it would move now, and recent runs. Admin only. */
export async function getEscalationStatus(): Promise<EscalationStatus> {
  const { data } = await apiClient.get<EscalationStatus>('/escalations/');
  return data;
}

/** Every ticket the escalation check would move now. Writes nothing. Admin only. */
export async function previewEscalations(): Promise<{ count: number; tickets: EscalationMove[] }> {
  const { data } = await apiClient.get('/escalations/preview/');
  return data;
}

/** Run the escalation check now, as the schedule would. Admin only. */
export async function runEscalations(): Promise<EscalationRun> {
  const { data } = await apiClient.post<EscalationRun>('/escalations/run/');
  return data;
}
