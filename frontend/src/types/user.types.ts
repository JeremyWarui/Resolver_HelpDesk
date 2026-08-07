export type UserRole =
  | 'user'
  | 'technician'
  | 'hos'
  | 'hod'
  | 'manager'
  | 'admin';

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  /** ISO timestamp — only populated on the admin user list (UserAdminSerializer), not on the logged-in user's own auth object. */
  date_joined?: string;
  role: UserRole;
  campus_name: string | null;
  sections: number[];
  section_names?: string[];
  primary_campus_id: number | null;
  primary_campus_display: string | null;
  primary_department_id: number | null;
  primary_department_display: string | null;
  primary_department_name?: string | null;
  /** The active role assignment's single section (technician/hos only). */
  section_name?: string | null;
  /** The user's home campus (UserProfile.campus) — independent of role scope;
   * used to route tickets they raise themselves as a requester. */
  home_campus_id: number | null;
  home_campus_name: string | null;
}

export interface CreateUserPayload {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  campus_id: number;
}

export interface UpdateUserPayload extends Partial<User> {
  campus_id?: number | null;
}

export interface RoleAssignment {
  id: number;
  role: UserRole;
  is_primary: boolean;
  campus_id: number | null;
  campus_name: string | null;
  department_id: number | null;
  department_name: string | null;
  section_id: number | null;
  section_name: string | null;
  assigned_by_username: string | null;
  assigned_at: string;
  valid_until: string | null;
}

export type BackendRoleAssignment = RoleAssignment;

export interface CreateRoleAssignmentPayload {
  role: UserRole;
  is_primary?: boolean;
  campus_id?: number | null;
  department_id?: number | null;
  section_id?: number | null;
  valid_until?: string | null;
}

export interface UpdateRoleAssignmentPayload {
  is_primary?: boolean;
  campus_id?: number | null;
  department_id?: number | null;
  section_id?: number | null;
}

export interface UsersResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: User[];
}

// ============================================
// USER DASHBOARD TYPES
// ============================================

export interface UserAnalytics {
  total: number;
  open: number;
  closed: number;
  pending: number;
  avg_resolution_hours: number;
}

export interface UserSummary {
  id: number;
  username: string;
  name: string;
}

export interface RecentTicket {
  id: number;
  ticket_no: string;
  title: string;
  status: string;
  priority?: string;
  campus: string;
  department?: string;
  section?: string;
  assigned_to?: {
    id: number;
    name: string;
  } | null;
  service_item?: string | null;
  created_at: string;
  updated_at: string;
  due_date?: string | null;
  is_overdue?: boolean;
}

export interface FeedbackOpportunity {
  id: number;
  ticket_no: string;
  title: string;
  resolved_at: string;
  section_name?: string;
}

export interface StatusDistribution {
  status: string;
  count: number;
}

export interface UserDashboard {
  user: UserSummary;
  summary: UserAnalytics;
  recent_tickets: RecentTicket[];
  feedback_needed: FeedbackOpportunity[];
  status_distribution: StatusDistribution[];
}
