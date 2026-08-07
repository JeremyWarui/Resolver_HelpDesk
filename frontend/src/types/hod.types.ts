import type { HODAnalytics } from './analytics.types';

/**
 * HOD Section info from dashboard
 */
export interface HODSection {
  id: number;
  name: string;
  code: string;
  section_type_name: string;
}

/**
 * HOD Technician info from dashboard
 */
export interface HODTechnician {
  id: number;
  username: string;
  name: string;
}

/**
 * Ticket counts by status
 */
export interface HODTicketsSummary {
  [status: string]: number;
}

/**
 * Complete HOD Dashboard response
 *
 * Extends HODAnalytics with additional section and technician data,
 * plus a consolidated ticket summary.
 */
export interface HODDashboard extends HODAnalytics {
  sections: HODSection[];
  technicians: HODTechnician[];
  tickets_summary: HODTicketsSummary;
}
