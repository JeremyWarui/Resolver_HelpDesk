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
import { reconcileRole } from '@/lib/api/client';
import type { User } from '@/types';

/**
 * The three session mutations, and whether one is in flight.
 *
 * The session itself is read from `useAuthStore`, which hydrates synchronously.
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

      // Re-validate the cached role on dashboard mount (page reload, tab
      // reopen). /auth/me/ re-derives the assignment from the database, so a
      // promotion or demotion made while this session was away is caught here
      // even though the access token is still valid and no refresh has run.
      // `reconcileRole` owns what happens next; the interceptor's refresh path
      // reaches the same function from the other direction.
      try {
        if (reconcileRole((await getProfile()).role)) return authUser;
      } catch {
        // Network/API failure: keep the cached profile; the 401 interceptor
        // owns expired-token handling.
      }

      // A stored user with no primary_campus_id takes the JWT's campus_id, saved
      // back through the store.
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
