import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types';

// Allow _retry flag on axios request configs without casting everywhere
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

// In production, VITE_API_URL_PROD overrides (set via hosting env vars).
// Fallback is relative /api/v1 so the vite preview proxy works for LAN/phone testing.
const BASE_URL =
  import.meta.env.MODE === 'production'
    ? (import.meta.env.VITE_API_URL_PROD ?? '/api/v1')
    : (import.meta.env.VITE_API_URL_DEV ?? 'http://localhost:8000/api/v1');

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send/receive httpOnly refresh cookie
});

// ── Request interceptor — attach JWT Bearer token ─────────────────────────────

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — JWT refresh + 401 handling ────────────────────────
// On 401: attempt POST /auth/refresh/ (uses httpOnly resolver_refresh cookie).
// If the refresh succeeds, update the stored access token and replay the
// original request once. If it fails, clear the session and redirect.
// A failedQueue drains all requests that arrived while a refresh was in flight.

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

export function clearSessionAndRedirect(reason?: 'role-changed'): void {
  useAuthStore.getState().clearUser();
  if (!window.location.pathname.includes('/login')) {
    const suffix = reason ? `?reason=${reason}` : '';
    window.location.href = `/login${suffix}`;
  }
}

/**
 * End the session when the server's role no longer matches the cached one.
 *
 * The only comparison of its kind, and both paths that learn a role from the
 * server reach it: the silent refresh below, which gets one on every token
 * rotation, and `/auth/me/` on dashboard mount, which covers the window where
 * the access token is still valid so no refresh has fired. The two catch
 * different moments and neither covers the other, but what they do about it
 * is one decision, and it is made here.
 *
 * The comparison is against the stored user, not the token's claim: the token
 * is reissued correctly scoped either way, and the copy that goes stale is the
 * user object the sidebar and the dashboard choice are drawn from. A roleless
 * requester is `user` in the store and null on the wire; both read as `user`,
 * which is what keeps a requester from being signed out on every rotation.
 *
 * Returns whether the session was cleared.
 */
export function reconcileRole(serverRole: UserRole | null): boolean {
  const cached = useAuthStore.getState().user;
  if (!cached || (serverRole ?? 'user') === cached.role) return false;
  clearSessionAndRedirect('role-changed');
  return true;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Queue concurrent 401s while a refresh is already in progress
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Use bare axios (not apiClient) to avoid triggering this interceptor again
      const { data } = await axios.post<{ accessToken: string; role: UserRole | null }>(
        `${BASE_URL}/auth/refresh/`,
        {},
        { withCredentials: true }
      );

      // jwt_refresh() re-reads the assignment from the database on every
      // rotation, so this is where an admin's promotion or demotion first
      // reaches a session that is still being used.
      if (reconcileRole(data.role)) {
        const err = new Error('Role changed, re-authentication required');
        processQueue(err, null);
        return Promise.reject(err);
      }

      const newToken = data.accessToken;
      // The request interceptor reads the store on every call, so updating
      // the store is what makes replayed + future requests use the new token.
      useAuthStore.getState().setToken(newToken);
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      clearSessionAndRedirect();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;

/** A DRF page. `count` is null on the cursor-paged feeds. */
export interface Page<T> {
  count: number | null;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** The rows of a list response, whether it pages or returns a bare array. */
export function rows<T>(data: T[] | Page<T>): T[] {
  return Array.isArray(data) ? data : (data.results ?? []);
}

/**
 * Every row of a paged list, following `next` to the end.
 *
 * For the lists a page renders whole — facilities in the wizard's dropdown,
 * users in the admin table. Stopping at the first page hands the caller a
 * silent subset.
 */
export async function fetchAll<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const all: T[] = [];
  // `next` is an absolute URL carrying the page and any filters, so the params
  // go with the first request only.
  let url: string | null = path;
  let query = params;

  while (url) {
    const { data }: { data: T[] | Page<T> } = await apiClient.get(url, { params: query });
    all.push(...rows<T>(data));
    url = Array.isArray(data) ? null : (data.next ?? null);
    query = undefined;
  }

  return all;
}
