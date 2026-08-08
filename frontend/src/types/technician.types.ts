export interface Technician {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  name?: string; // Computed: first_name + last_name
  email: string;
  role: 'technician';
  sections: number[]; // Array of section IDs
  section_names?: string[];
  /** The trades this technician works. Together with `sections` these are the
   *  `(section, sub_section)` pairs `scoped_ticket_qs` matches on — a
   *  technician sees a ticket only where both halves line up. Served by the
   *  /technicians/ roster. */
  sub_sections?: number[];
  sub_section_names?: string[];
  campus_name: string | null;          // primary_campus.name — plain name e.g. "Nairobi"
  primary_campus_id: number | null;
  primary_campus_display: string | null; // Campus.__str__() e.g. "KSG-NRB: Nairobi"
  primary_department_id: number | null;
  primary_department_display: string | null;
  primary_department_name?: string | null;
}

export interface TechniciansResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Technician[];
}

export interface TechniciansParams {
  page?: number;
  page_size?: number;
  sections?: number; // Filter by section ID
  ordering?: string;
  search?: string;
}

// Technician Dashboard Types

export interface TechnicianKPIs {
  open_assignments: number;
  resolved_today: number;
  resolved_this_week: number;
  resolved_this_month: number;
  total_assigned: number;
  total_resolved: number;
  escalated: number;
  resolution_rate_pct: number;
  avg_resolution_hours: number;
  avg_rating: number;
}

export interface TechnicianSection {
  id: number;
  name: string;
  code: string;
  campus: string;
  department: string;
  section_type_name: string;
}

export interface ServiceItemInfo {
  id: number;
  name: string;
  requires_approval: boolean;
}

export interface DashboardTicket {
  id: number;
  ticket_no: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  campus: string;
  section_name: string;
  raised_by: string;
  pending_reason: string | null;
  pending_comment: string | null;
  escalation_level: number;
  escalation_status: { code: string; label: string };
  is_due_for_escalation: boolean;
  service_item: ServiceItemInfo;
}


