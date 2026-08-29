import apiClient from './client';
import type { AssignedUser } from '@/types';

/** One TicketLog row, as the admin audit table lists it. */
export interface AuditLogEntry {
  id: number;
  event_type: string;
  from_value: string;
  to_value: string;
  reason: string;
  /** Null for a system-generated row. */
  actor: AssignedUser | null;
  /** Who the ticket climbed to, on an escalation. */
  level_user: AssignedUser | null;
  ticket_no: string;
  created_at: string;
}

export interface AuditLogParams {
  page?: number;
  page_size?: number;
  /** Matched against username, first name and last name. */
  actor?: string;
  date_from?: string;
  date_to?: string;
}

/** Every log row in the system, newest first. Admin only. */
export const getAuditLog = (params?: AuditLogParams) =>
  apiClient.get<{ count: number; results: AuditLogEntry[] }>('/admin/audit-log/', { params });
