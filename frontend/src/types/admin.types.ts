interface SystemOverview { [key: string]: unknown; }
interface OverdueTicket { id: number; ticket_no: string; [key: string]: unknown; }

/**
 * Admin user info returned by admin dashboard endpoint
 */
export interface AdminInfo {
  id: number;
  username: string;
  name: string;
  email: string;
}

/**
 * Organisational summary counts
 */
export interface OrgSummary {
  total_sections: number;
  total_technicians: number;
  total_facilities: number;
  total_campuses: number;
  total_departments: number;
}

/**
 * Analytics data in admin dashboard (system overview + overdue tickets)
 */
export interface AdminAnalyticsData {
  system_overview: SystemOverview;
  overdue_tickets: OverdueTicket[];
}

/**
 * Complete Admin Dashboard response
 *
 * Consolidated endpoint that returns:
 * - Admin user information
 * - System-wide analytics (overview, overdue tickets)
 * - Organisation structure summary (counts)
 */
export interface AdminDashboard {
  admin: AdminInfo;
  analytics: AdminAnalyticsData;
  org_summary: OrgSummary;
  [key: string]: unknown;
}
