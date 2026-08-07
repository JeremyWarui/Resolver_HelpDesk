import apiClient from './client';
import type { Priority } from '@/types';

export interface EscalationRule {
  id: number;
  priority: number;
  to_level: 'hos' | 'hod';
  threshold_minutes: number;
  order: number;
}

export interface SLAPriority extends Priority {
  escalation_rules: EscalationRule[];
}

export async function getPriorities(): Promise<SLAPriority[]> {
  const { data } = await apiClient.get('/priorities/');
  return Array.isArray(data) ? data : (data.results ?? []);
}

export async function updatePriority(
  id: number,
  payload: Partial<Pick<Priority, 'name' | 'rank' | 'response_minutes' | 'resolution_minutes'>>
): Promise<SLAPriority> {
  const { data } = await apiClient.patch(`/priorities/${id}/`, payload);
  return data;
}

export async function createEscalationRule(
  priorityId: number,
  payload: Pick<EscalationRule, 'to_level' | 'threshold_minutes' | 'order'>
): Promise<EscalationRule> {
  const { data } = await apiClient.post(
    `/priorities/${priorityId}/escalation-rules/`,
    payload
  );
  return data;
}

export async function updateEscalationRule(
  priorityId: number,
  ruleId: number,
  payload: Partial<Pick<EscalationRule, 'to_level' | 'threshold_minutes' | 'order'>>
): Promise<EscalationRule> {
  const { data } = await apiClient.patch(
    `/priorities/${priorityId}/escalation-rules/${ruleId}/`,
    payload
  );
  return data;
}

export async function deleteEscalationRule(
  priorityId: number,
  ruleId: number
): Promise<void> {
  await apiClient.delete(`/priorities/${priorityId}/escalation-rules/${ruleId}/`);
}
