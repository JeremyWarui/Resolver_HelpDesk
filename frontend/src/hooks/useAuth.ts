// Thin adapter over the auth store — same public surface as before, but the
// session state now comes from useAuthStore (the single source of truth), so
// every component calling useAuth() re-renders when the session changes.
// The old version held a per-component useState snapshot of localStorage,
// which silently went stale in components that didn't remount.

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  hasRole,
  getUserRole,
} from '@/lib/api/auth';
import type { LoginResponse, LoginCredentials, RegisterPayload } from '@/lib/api/auth';

export const useAuth = () => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [isLoading, setIsLoading] = useState(false);

  // apiLogin/apiRegister/apiLogout update the store themselves; the
  // subscriptions above propagate the change to every consumer.
  const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
    setIsLoading(true);
    try {
      return await apiLogin(credentials);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: RegisterPayload): Promise<LoginResponse> => {
    setIsLoading(true);
    try {
      return await apiRegister(payload);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await apiLogout();
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    hasRole,
    getUserRole,
  };
};
