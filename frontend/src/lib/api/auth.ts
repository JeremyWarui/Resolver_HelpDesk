import apiClient from './client';
import { useAuthStore } from '@/stores/authStore';
import type { RoleAssignment, User, UserRole } from '@/types';

// ── Backend JWT response shape ────────────────────────────────────────────────

interface JWTUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  primary_campus_id: number | null;
  primary_campus_name: string | null;
  home_campus_id: number | null;
  home_campus_name: string | null;
  active_role: {
    id?: number;
    role: UserRole;
    campus_id?: number | null;
    campus_name?: string | null;
  } | null;
}

interface JWTLoginResponse {
  user: JWTUser;
  accessToken: string;
}

// ── Flat shape returned to callers and stored in localStorage ─────────────────
// Keeps the same surface as the old DRF token response so all callers
// (LoginForm, useAuth, useUserData) require no changes.

/** Decode a JWT's payload. base64url is not base64: `-` and `_` must be
 *  translated before atob. Returns null rather than throwing — a malformed
 *  token is a logged-out user, not a crash. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export interface LoginResponse {
  token: string;
  user_id: number;
  username: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  full_name: string;
  /** What the role oversees — null for an admin, a manager and a requester. */
  primary_campus_id: number | null;
  primary_campus_name: string | null;
  /** Where the person is based, which routes the tickets they raise. */
  home_campus_id: number | null;
  home_campus_name: string | null;
}

export interface LoginCredentials {
  /** The email address is the credential — usernames are not accepted. */
  email: string;
  password: string;
  remember_me?: boolean;
}

/** Username, first name and last name are all derived server-side from the
 *  email's local part (jeremy.mwangi@ksg.ac.ke → jeremy.mwangi / Jeremy
 *  Mwangi), so there is nothing else for the form to collect. */
export interface RegisterPayload {
  email: string;
  password: string;
  campus_id: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenJWT(data: JWTLoginResponse): LoginResponse {
  const ar = data.user.active_role;

  // campus_id comes from the JWT claim (set from UserProfile) — authoritative
  // for all roles including pure requesters where active_role is null.
  const claims = decodeJwtPayload(data.accessToken);
  const tokenCampusId = typeof claims?.campus_id === 'number' ? claims.campus_id : null;

  return {
    token: data.accessToken,
    user_id: data.user.id,
    username: data.user.username,
    email: data.user.email,
    role: ar?.role ?? 'user',
    first_name: data.user.first_name,
    last_name: data.user.last_name,
    full_name: data.user.full_name,
    primary_campus_id: ar?.campus_id ?? null,
    primary_campus_name: ar?.campus_name ?? null,
    // From the JWT claim, which every role carries — `active_role` is null for
    // a plain requester, and they still raise tickets from somewhere.
    home_campus_id: tokenCampusId,
    home_campus_name: data.user.home_campus_name ?? null,
  };
}

/** Map the flat login response to the app-wide User shape.
 * Display variants the response doesn't carry are null — useUserData
 * refreshes them on next mount. */
function flatToUser(flat: LoginResponse): User {
  return {
    id: flat.user_id,
    username: flat.username,
    email: flat.email,
    first_name: flat.first_name,
    last_name: flat.last_name,
    full_name: flat.full_name,
    role: flat.role,
    primary_campus_id: flat.primary_campus_id,
    primary_campus_name: flat.primary_campus_name,
    home_campus_id: flat.home_campus_id,
    home_campus_name: flat.home_campus_name,
  };
}

function persistSession(data: LoginResponse): void {
  useAuthStore.getState().setUser(flatToUser(data), data.token);
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const { data } = await apiClient.post<JWTLoginResponse>('/auth/login/', credentials);
  const flat = flattenJWT(data);
  persistSession(flat);
  return flat;
}

export async function register(payload: RegisterPayload): Promise<LoginResponse> {
  const { data } = await apiClient.post<JWTLoginResponse>('/auth/register/', payload);
  const flat = flattenJWT(data);
  persistSession(flat);
  return flat;
}

export interface PublicCampus {
  id: number;
  name: string;
  code: string;
}

export async function getPublicCampuses(): Promise<PublicCampus[]> {
  const { data } = await apiClient.get<PublicCampus[]>('/auth/campuses/');
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout/');
  } catch {
    // Always clear local session even if server call fails
  } finally {
    clearSession();
  }
}

// GET /auth/me/ returns the serialized user at the TOP level (no `user`
// wrapper, no accessToken) with the server-re-derived active_role — the
// authoritative answer to "what role is this session actually in now".
export interface MeResponse {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  /** active_role.role, defaulting to 'user' for pure requesters. */
  role: UserRole;
  active_role: RoleAssignment | null;
  primary_campus_id: number | null;
  primary_campus_name: string | null;
  home_campus_id: number | null;
  home_campus_name: string | null;
}

export async function getProfile(): Promise<MeResponse> {
  const { data } = await apiClient.get<Omit<MeResponse, 'role'>>('/auth/me/');
  return { ...data, role: (data.active_role?.role as UserRole) ?? 'user' };
}

export function clearSession(): void {
  useAuthStore.getState().clearUser();
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}
