import apiClient from './client';
import type { AnalyticsEnvelope, AnalyticsParams } from '@/types';

/** Every figure the system reports, in one call. Scope comes from the JWT. */
export async function getAnalytics(params?: AnalyticsParams): Promise<AnalyticsEnvelope> {
  const { data } = await apiClient.get<AnalyticsEnvelope>('/analytics/', { params });
  return data;
}
