import type { ManagerAnalytics } from './analytics.types';

export interface ManagerTicketsSummary {
  [status: string]: number;
}

export interface ManagerDashboard extends ManagerAnalytics {
  tickets_summary: ManagerTicketsSummary;
  [key: string]: unknown;
}

// Sub-entity types used by manager dashboard component props
export interface ManagerCampusStat {
  campus: { id: number; name: string; code: string };
  total?: number;
  open?: number;
  escalated?: number;
  sla_compliance?: number;
  sla_24h_pct?: number;
  avg_resolution_hours?: number | null;
}

export interface ManagerSectionStat {
  section: { id: number; name: string; code: string; campus?: { name: string; code: string } };
  total?: number;
  total_tickets?: number;
  open?: number;
  open_tickets?: number;
  escalated?: number;
  escalated_tickets?: number;
  resolved?: number;
  sla_compliance?: number;
  avg_resolution_hours?: number | null;
  technician_count?: number;
  campus?: { id: number; name: string; code: string };
}

export interface ManagerTechnicianStat {
  technician?: { id: number; name?: string; username: string };
  user?: { id: number; username: string };
  total_assigned?: number;
  open?: number;
  resolved?: number;
  avg_resolution_hours?: number | null;
}
