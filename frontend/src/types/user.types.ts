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
  primary_department_id: number | null;
  primary_department_name?: string | null;
  /** The active role assignment's single section (technician/hos only). */
  section_name?: string | null;
  /** The user's home campus (UserProfile.campus) — independent of role scope;
   * used to route tickets they raise themselves as a requester. */
  home_campus_id: number | null;
  home_campus_name: string | null;
}

/** Username and name are derived from the email server-side
 *  (backend/apps/accounts/identity.py) — there is nothing else to send. */
export interface CreateUserPayload {
  email: string;
  password: string;
  campus_id: number;
}

/** Editing the email re-derives username, first and last name with it; neither
 *  can be set on its own, which is why they are absent here. */
export interface UpdateUserPayload {
  email?: string;
  campus_id?: number | null;
}

export interface RoleAssignment {
  id: number;
  role: UserRole;
  campus_id: number | null;
  campus_name: string | null;
  department_id: number | null;
  department_name: string | null;
  section_id: number | null;
  section_name: string | null;
  /** Technician only — the trades they work in that section. */
  sub_section_ids: number[];
  assigned_by_username: string | null;
  assigned_at: string;
  /** Present only on the POST response, and only when this assignment took a
   *  supervisor post off someone. One person holds a post (SOT §3b), so filling
   *  it demotes the incumbent to requester — a bigger change than the admin
   *  asked for, and one they cannot see on a screen that no longer names him. */
  displaced?: {
    id: number;
    full_name: string;
    email: string;
    detail: string;
  };
}

/** POST /users/{id}/role-assignments/ — a user has one role, so this replaces
 *  whatever they had. No is_primary and no valid_until: there is no cover to
 *  arrange, and the fields are what would let time-boxed roles back in.
 *
 *  `sub_section_ids` is technician-only and REQUIRED for technicians — the
 *  server syncs the SectionTechnician rows from it, and a technician with a
 *  role but no trades would see no tickets at all. */
export interface CreateRoleAssignmentPayload {
  role: UserRole;
  campus_id?: number | null;
  department_id?: number | null;
  section_id?: number | null;
  sub_section_ids?: number[];
}

export interface UsersResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: User[];
}
