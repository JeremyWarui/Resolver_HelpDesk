import apiClient, { type Page } from './client';
import type { SystemFeedbackCategory, SystemFeedbackEntry } from '@/types';

/** Anyone signed in. `page` is where they were when they wrote it. */
export async function sendSystemFeedback(payload: {
  category: SystemFeedbackCategory;
  message: string;
  page: string;
}): Promise<void> {
  await apiClient.post('/system-feedback/', payload);
}

/** Admin only. `status` narrows to new or reviewed; omitted, everything. */
export async function getSystemFeedback(params: {
  status?: 'new' | 'reviewed';
  page?: number;
  page_size?: number;
}): Promise<Page<SystemFeedbackEntry>> {
  const { data } = await apiClient.get<Page<SystemFeedbackEntry>>('/system-feedback/', { params });
  return data;
}

export async function setSystemFeedbackReviewed(id: number, reviewed: boolean): Promise<void> {
  await apiClient.patch(`/system-feedback/${id}/`, { reviewed });
}
