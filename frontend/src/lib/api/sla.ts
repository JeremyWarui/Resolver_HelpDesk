import apiClient from './client';
import type { Priority } from '@/types';

/** The four priority levels and their SLA targets. Read by anyone signed in. */
export async function getPriorities(): Promise<Priority[]> {
  const { data } = await apiClient.get('/priorities/');
  return Array.isArray(data) ? data : (data.results ?? []);
}

/** Edit one priority's targets or name. Admin only; the set of levels is fixed. */
export async function updatePriority(
  id: number,
  payload: Partial<Omit<Priority, 'id' | 'rank'>>
): Promise<Priority> {
  const { data } = await apiClient.patch(`/priorities/${id}/`, payload);
  return data;
}
