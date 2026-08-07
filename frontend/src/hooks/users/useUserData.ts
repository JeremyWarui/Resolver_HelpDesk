import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getProfile } from '@/lib/api/auth';
import { clearSessionAndRedirect } from '@/lib/api/client';
import type { User } from '@/types';

export const USER_PROFILE_KEY = ['currentUser'] as const;

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
        try {
          const payload = JSON.parse(
            atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
          );
          if (typeof payload.campus_id === 'number') {
            const patched = { ...authUser, primary_campus_id: payload.campus_id };
            setUser(patched, token);
            return patched;
          }
        } catch {
          /* ignore */
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

export default useUserData;
