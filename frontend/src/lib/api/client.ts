import axios from 'axios';
import { wsDisconnect } from '@/lib/ws/wsClient';
import { useAuthStore } from '@/stores/authStore';

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
  // Tear the socket down explicitly — otherwise its exponential-backoff
  // reconnect loop keeps re-authenticating with a token that's about to be
  // wiped, and briefly reappears if the redirect races the network tab.
  wsDisconnect();
  useAuthStore.getState().clearUser();
  if (!window.location.pathname.includes('/login')) {
    const suffix = reason ? `?reason=${reason}` : '';
    window.location.href = `/login${suffix}`;
  }
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
      const { data } = await axios.post<{ accessToken: string; roleChanged: boolean }>(
        `${BASE_URL}/auth/refresh/`,
        {},
        { withCredentials: true }
      );

      // jwt_refresh() re-derives role/scope from the DB on every rotation, so
      // roleChanged means an admin promoted/demoted this user since they last
      // logged in. The new access token is already scoped correctly, but the
      // cached user object (sidebar, dashboard choice) is stale and only ever
      // refreshed at login/switch-role — force a clean re-login rather than
      // let the UI keep showing the old role's shell.
      if (data.roleChanged) {
        const err = new Error('Role changed — re-authentication required');
        processQueue(err, null);
        clearSessionAndRedirect('role-changed');
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
