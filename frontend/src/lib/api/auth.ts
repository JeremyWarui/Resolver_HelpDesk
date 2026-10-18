import apiClient from './client';
import { useAuthStore } from '@/stores/authStore';
import type { CodeRef, User } from '@/types';

/** What `/auth/login/` returns: the user as `/users/` renders them, and an access token. */
interface SessionResponse {
  user: User;
  accessToken: string;
}

export interface LoginCredentials {
  /** The email address is the credential — usernames are not accepted. */
  email: string;
  password: string;
}

/** Username, first name and last name are all derived server-side from the
 *  email's local part (jeremy.mwangi@ksg.ac.ke → jeremy.mwangi / Jeremy
 *  Mwangi), so there is nothing else for the form to collect. */
export interface RegisterPayload {
  email: string;
  password: string;
  campus_id: number;
}

/** Sign in and keep the session. */
export async function login(credentials: LoginCredentials): Promise<User> {
  const { data } = await apiClient.post<SessionResponse>('/auth/login/', credentials);
  useAuthStore.getState().setUser(data.user, data.accessToken);
  return data.user;
}

/** Create an account. It does not sign in: the person signs in with what they just gave. */
export async function register(payload: RegisterPayload): Promise<void> {
  await apiClient.post('/auth/register/', payload);
}

export async function getPublicCampuses(): Promise<CodeRef[]> {
  const { data } = await apiClient.get<CodeRef[]>('/auth/campuses/');
  return data;
}

/** End the session here even when the server cannot be reached. */
export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout/');
  } catch {
    // The local session ends either way.
  } finally {
    useAuthStore.getState().clearUser();
  }
}

/** The signed-in user with the role the database holds now, not the token's. */
export async function getProfile(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/me/');
  return data;
}

/** Ask for a reset link. The answer is the same whether or not the address has an account. */
export async function requestPasswordReset(email: string): Promise<string> {
  const { data } = await apiClient.post<{ detail: string }>('/auth/password-reset/', { email });
  return data.detail;
}

/** Set a new password from the uid and token in a reset link. */
export async function confirmPasswordReset(payload: { uid: string; token: string; password: string }): Promise<string> {
  const { data } = await apiClient.post<{ detail: string }>('/auth/password-reset/confirm/', payload);
  return data.detail;
}
