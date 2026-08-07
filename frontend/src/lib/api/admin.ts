// Admin domain module — system-level endpoints only accessible to admin role.
// User management → users.ts | Org structure → organizations.ts | Reports → reports.ts
// This module covers endpoints with no other natural home.
import apiClient from './client';

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: number;
  actor: string;
  action: string;
  target_type: string;
  ticket_no: string | null;
  priority: string | null;
  department: string | null;
  detail: string;
  reason: string;
  created_at: string;
}

export interface AuditLogParams {
  page?: number;
  page_size?: number;
  actor?: string;
  action?: string;
  target_type?: string;
  date_from?: string;
  date_to?: string;
}

export const getAuditLog = (params?: AuditLogParams) =>
  apiClient.get<{ count: number; results: AuditLogEntry[] }>('/admin/audit-log/', { params });

// ── System config ─────────────────────────────────────────────────────────────

export interface SystemConfig {
  auto_escalation_enabled: boolean;
  sla_enforcement_enabled: boolean;
  email_notifications_enabled: boolean;
}

export const getSystemConfig = () =>
  apiClient.get<SystemConfig>('/admin/config/');

export const updateSystemConfig = (data: Partial<SystemConfig>) =>
  apiClient.patch<SystemConfig>('/admin/config/', data);
