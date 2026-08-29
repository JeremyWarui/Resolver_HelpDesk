// The signed-in session: who it is, how it starts, and how it ends.
//
// State comes from `useAuthStore`, the single source of truth, so every
// component calling these re-renders when the session changes. The API
// functions update the store themselves; the subscriptions below propagate it.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getProfile,
  decodeJwtPayload,
} from '@/lib/api/auth';
import type { LoginResponse, LoginCredentials, RegisterPayload } from '@/lib/api/auth';
import { clearSessionAndRedirect } from '@/lib/api/client';
import type { User } from '@/types';

/**
 * The three session mutations, and whether one is in flight.
 *
 * Deliberately does not re-expose `user` or `isAuthenticated`: those live in
 * `useAuthStore`, which hydrates synchronously and is what the rest of the app
 * subscribes to directly. Handing them back through here bought an indirection
 * and a per-component `isLoading` that only this component's own calls can
 * set — which is how a route guard came to render a spinner nothing could
 * ever trigger.
 */
export const useAuth = () => {
  const [isLoading, setIsLoading] = useState(false);

  const run = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setIsLoading(true);
    try {
      return await fn();
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    login: (credentials: LoginCredentials): Promise<LoginResponse> => run(() => apiLogin(credentials)),
    register: (payload: RegisterPayload): Promise<LoginResponse> => run(() => apiRegister(payload)),
    logout: (): Promise<void> => run(apiLogout),
  };
};

/**
 * Sign out, then leave for the login page.
 *
 * No loading flag: on success this navigates away, so nothing is left mounted
 * to render one.
 */
export const useLogout = () => {
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      window.location.href = '/login';
    } catch (error) {
      toast.error('Failed to logout');
      console.error('Logout error:', error);
    }
  };

  return { handleLogout };
};

const USER_PROFILE_KEY = ['currentUser'] as const;

/** The signed-in user, re-validated against the server on dashboard mount. */
export const useUserData = () => {
  const authUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const { data, isLoading, error, refetch } = useQuery<User | null>({
    queryKey: [...USER_PROFILE_KEY, authUser?.id],
    queryFn: async () => {
      if (!authUser) return null;
      const token = useAuthStore.getState().getToken() ?? '';

      // Re-validate the cached role against the server on dashboard mount
      // (page reload, tab reopen). /auth/me/ re-derives the active assignment
      // from the DB, so a promotion/demotion done while this session was live
      // is caught even when the role_changed WS push couldn't reach us
      // (socket down, no channel layer) and the access token hasn't expired
      // yet (jwt_refresh's roleChanged check is the expiry-time fallback).
      try {
        const profile = await getProfile();
        if (profile.role !== authUser.role) {
          clearSessionAndRedirect('role-changed');
          return authUser;
        }
      } catch {
        // Network/API failure: keep the cached profile; the 401 interceptor
        // owns expired-token handling.
      }

      // Patch campus_id from the JWT payload if the stored value is null
      // (sessions created before the flattenJWT campus_id fix) and re-persist
      // through the store.
      if (!authUser.primary_campus_id && token) {
        const claims = decodeJwtPayload(token);
        if (typeof claims?.campus_id === 'number') {
          const patched = { ...authUser, primary_campus_id: claims.campus_id };
          setUser(patched, token);
          return patched;
        }
      }
      return authUser;
    },
    enabled: !!authUser,
    staleTime: 10 * 60 * 1000,
  });

  return {
    userData: data ?? authUser ?? null,
    loading: isLoading,
    error: error as Error | null,
    refetch,
  };
};
