import apiClient from './client';

export interface GenerateReportParams {
  report_type:
    | 'ticket-lifecycle'
    | 'technician-performance'
    | 'facility-health'
    | 'pending-analysis'
    | 'comprehensive';
  timeframe?: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';
  start_date?: string;
  end_date?: string;
  status?: string;
  section_id?: number;
  technician_id?: number;
}

export async function generateReport(params: GenerateReportParams): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/reports/generate/', {
    params,
    responseType: 'blob',
  });
  return data;
}

export function downloadReport(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

const REPORT_TYPE_NAMES: Record<string, string> = {
  'ticket-lifecycle': 'Ticket_Lifecycle_Report',
  'technician-performance': 'Technician_Performance_Report',
  'facility-health': 'Facility_Health_Report',
  'pending-analysis': 'Pending_Analysis_Report',
  comprehensive: 'Comprehensive_Report',
};

export async function generateAndDownload(params: GenerateReportParams): Promise<void> {
  const blob = await generateReport(params);
  const name = REPORT_TYPE_NAMES[params.report_type] ?? 'Report';
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  downloadReport(blob, `${name}_${date}.xlsx`);
}

const reportsService = {
  generateReport,
  downloadReport,
  generateAndDownload,
};

export default reportsService;
