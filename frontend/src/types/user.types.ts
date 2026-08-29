export type UserRole =
  | 'user'
  | 'technician'
  | 'hos'
  | 'hod'
  | 'manager'
  | 'admin';

/** Two campuses, and they are different facts. `home_campus_*` is where the
 *  person is based and routes the tickets they raise. `primary_campus_*` is
 *  what their role oversees, and is null for a manager, an admin and a plain
 *  requester. */
export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  /** Admin user list only (UserAdminSerializer), not the signed-in user's own object. */
  date_joined?: string;
  role: UserRole;
  primary_campus_id: number | null;
  primary_campus_name: string | null;
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
  /** Technician only — the trades they work at that campus. */
  trade_ids: number[];
  assigned_by_username: string | null;
  assigned_at: string;
  /** Present only on the POST response, and only when this assignment took a
   *  supervisor post off someone. One person holds a post, so filling it
   *  demotes the incumbent to requester, which is more than the admin asked
   *  for and is not visible on a screen that stops naming them. */
  displaced?: {
    id: number;
    full_name: string;
    email: string;
    detail: string;
  };
}

/** POST /users/{id}/role-assignments/ — a user has one role, so this replaces
 *  whatever they held.
 *
 *  `campus_id` is required for a technician, an HOS and an HOD, and refused for
 *  the rest. `trade_ids` is technician-only and required: the server writes the
 *  TechnicianTrade rows from it, and a technician with no trade sees no
 *  tickets at all. */
export interface CreateRoleAssignmentPayload {
  role: UserRole;
  campus_id?: number | null;
  trade_ids?: number[];
}

export interface UsersResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: User[];
}

/** A technician as `/technicians/` serves them: the user row plus the trades
 *  they work. Their scope is the (campus, trade) pair — `primary_campus_id`
 *  and one of `trade_ids` — so neither half is ever read alone. */
export interface Technician extends User {
  role: 'technician';
  trade_ids: number[];
  trade_names: string[];
}
