import apiClient from './client';
import type { AnalyticsEnvelope, AnalyticsParams, DashboardEnvelope, OverviewEnvelope, OverviewParams } from '@/types';

/** Every figure the system reports, in one call. Scope comes from the JWT. */
export async function getAnalytics(params?: AnalyticsParams): Promise<AnalyticsEnvelope> {
  const { data } = await apiClient.get<AnalyticsEnvelope>('/analytics/', { params });
  return data;
}

/** The manager's report page, every section of it. */
export async function getOverview(params: OverviewParams): Promise<OverviewEnvelope> {
  const { data } = await apiClient.get<OverviewEnvelope>('/analytics/overview/', { params });
  return data;
}

/** The manager's dashboard: right now and this week. */
export async function getDashboard(): Promise<DashboardEnvelope> {
  const { data } = await apiClient.get<DashboardEnvelope>('/analytics/dashboard/');
  return data;
}

export type ReportFormat = 'xlsx' | 'pdf';

/** Fetch a report file and hand it to the browser to save. Same scope and
 *  window as `getAnalytics`; the server names the file. */
export async function downloadReport(format: ReportFormat, params?: AnalyticsParams): Promise<void> {
  const response = await apiClient.get<Blob>(`/analytics/export/${format}/`, {
    params,
    responseType: 'blob',
  });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `helpdesk-report.${format}`;

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // After the browser has started the download; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
