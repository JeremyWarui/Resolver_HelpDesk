import type { ManagerAnalytics } from './analytics.types';

export interface ManagerTicketsSummary {
  [status: string]: number;
}

export interface ManagerDashboard extends ManagerAnalytics {
  tickets_summary: ManagerTicketsSummary;
  [key: string]: unknown;
}

// Sub-entity types used by manager dashboard component props
