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
  /** Admin user list and technician roster only. A deactivated account cannot sign in. */
  is_active?: boolean;
  /** Admin user list and technician roster only: what keeps the account from working. */
  problems?: AccountProblem[];
}

/** Something wrong with an account that can still sign in, from `accounts/health.py`. */
export interface AccountProblem {
  code: 'no_home_campus' | 'technician_without_trade';
  label: string;
  effect: string;
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
  /** Present only on the POST response, and only when this assignment took a
   *  supervisor post off someone. One person holds a post, so filling it
   *  demotes the incumbent to requester; the dialog warns the admin. */
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

/** A technician as `/technicians/` serves them: the user row plus the trades
 *  they work. Their scope is the (campus, trade) pair — `primary_campus_id`
 *  and one of `trade_ids` — so neither half is ever read alone. */
export interface Technician extends User {
  role: 'technician';
  trade_ids: number[];
  trade_names: string[];
  /** Every campus they hold a (campus, trade) pair at; can be more than `primary_campus_id`. */
  campus_ids: number[];
}
