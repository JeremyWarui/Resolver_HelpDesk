import apiClient from './client';
import type { AnalyticsEnvelope, AnalyticsParams, CoverEnvelope, DashboardEnvelope, DeskEnvelope, DashboardParams, ReportParams, OverviewEnvelope, OverviewParams } from '@/types';

/** Every figure the system reports, in one call. Scope comes from the JWT. */
export async function getAnalytics(params?: AnalyticsParams): Promise<AnalyticsEnvelope> {
  const { data } = await apiClient.get<AnalyticsEnvelope>('/analytics/', { params });
  return data;
}

/** The Reports page of the manager, HOD or HOS, every section of it. */
export async function getOverview(params: OverviewParams): Promise<OverviewEnvelope> {
  const { data } = await apiClient.get<OverviewEnvelope>('/analytics/overview/', { params });
  return data;
}

/** The dashboard of the manager, HOD or HOS: right now and this week, each chart over its own period. */
export async function getDashboard(params: DashboardParams): Promise<DashboardEnvelope> {
  const { data } = await apiClient.get<DashboardEnvelope>('/analytics/dashboard/', {
    params: { trend_days: params.trend_days, open_days: params.open_days ?? undefined },
  });
  return data;
}

/** Technicians per (campus, trade) over the caller's campuses, and the gaps. */
export async function getCover(): Promise<CoverEnvelope> {
  const { data } = await apiClient.get<CoverEnvelope>('/analytics/cover/');
  return data;
}

/** The admin's dashboard: what needs setting up, and whether the work is moving. */
export async function getDesk(): Promise<DeskEnvelope> {
  const { data } = await apiClient.get<DeskEnvelope>('/analytics/desk/');
  return data;
}

export type ReportFormat = 'xlsx' | 'pdf';

/** Fetch a report file and hand it to the browser to save. Same scope and
 *  window as `getAnalytics`, narrowed to `campus` when one is given; the
 *  server names the file. */
export async function downloadReport(format: ReportFormat, params?: ReportParams): Promise<void> {
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
