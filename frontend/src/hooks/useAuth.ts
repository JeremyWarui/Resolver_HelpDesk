// The signed-in session: how it starts, how it ends, and how it is re-checked.
//
// The session itself is read from `useAuthStore`, which hydrates synchronously.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getProfile,
} from '@/lib/api/auth';
import type { LoginCredentials, RegisterPayload } from '@/lib/api/auth';
import { reconcileRole } from '@/lib/api/client';
import type { User } from '@/types';

/** The three session mutations, and whether one is in flight. */
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
    login: (credentials: LoginCredentials): Promise<User> => run(() => apiLogin(credentials)),
    register: (payload: RegisterPayload): Promise<void> => run(() => apiRegister(payload)),
    logout: (): Promise<void> => run(apiLogout),
  };
};

/** Sign out, then leave for the login page. `logout` never fails: the local session ends either way. */
export const useLogout = () => {
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    window.location.href = '/login';
  };

  return { handleLogout };
};

/**
 * Re-checks the cached role against the server when the dashboard mounts.
 *
 * `/auth/me/` re-derives the assignment from the database, so a promotion or
 * demotion made while this session was away is caught here even though the
 * access token is still valid and no refresh has run. `reconcileRole` owns what
 * happens next; the interceptor's refresh path reaches it from the other side.
 */
export const useRoleCheck = () => {
  const userId = useAuthStore((s) => s.user?.id);

  useQuery({
    queryKey: ['currentUser', userId],
    queryFn: async () => {
      const profile = await getProfile();
      reconcileRole(profile.role);
      return profile.role;
    },
    enabled: userId != null,
    staleTime: 10 * 60 * 1000,
    // A failed check keeps the cached session; the 401 interceptor owns expired tokens.
    retry: false,
  });
};
