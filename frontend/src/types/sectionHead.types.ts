import type { SectionHeadAnalytics } from './analytics.types';

/**
 * Section Head assigned section info from dashboard
 */
export interface SectionHeadSection {
  id: number;
  name: string;
  code: string;
  campus: string;
  section_type_name: string;
}

/**
 * Section Head technician info from dashboard
 */
export interface SectionHeadTechnician {
  id: number;
  username: string;
  name: string;
}

/**
 * Ticket counts by status
 */
export interface SectionHeadTicketsSummary {
  [status: string]: number;
}

/**
 * Complete Section Head Dashboard response
 *
 * Extends SectionHeadAnalytics with additional section and technician data,
 * plus a consolidated ticket summary.
 */
export interface SectionHeadDashboard extends SectionHeadAnalytics {
  sections: SectionHeadSection[];
  technicians: SectionHeadTechnician[];
  tickets_summary: SectionHeadTicketsSummary;
}
