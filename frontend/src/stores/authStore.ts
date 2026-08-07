// Single source of truth for the auth session (user + access token).
//
// localStorage (authToken / currentUser) is a persistence detail owned
// exclusively by this store: every read goes through store state and every
// write goes through a store action. The store hydrates synchronously at
// module load, so the session is available on first render — no async
// re-hydration step. Components subscribe via useAuthStore (or the useAuth
// adapter hook); non-React modules use useAuthStore.getState().

import { create } from 'zustand';
import type { User, UserRole } from '@/types';

const TOKEN_KEY = 'authToken';
const USER_KEY = 'currentUser';

function readStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

// The old zustand persist middleware kept a third copy of the token under
// this key; clean it up so authToken/currentUser are the only stored state.
localStorage.removeItem('auth-store');

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  setUser: (user: User, token: string) => void;
  /** Update only the access token (silent JWT refresh) — user is unchanged. */
  setToken: (token: string) => void;
  clearUser: () => void;
  getToken: () => string | null;
  switchRole: (role: UserRole) => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: readStoredUser(),
  token: localStorage.getItem(TOKEN_KEY),
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),

  setUser: (user, token) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  setToken: (token) => {
    localStorage.setItem(TOKEN_KEY, token);
    set({ token, isAuthenticated: true });
  },

  clearUser: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ user: null, token: null, isAuthenticated: false });
  },

  getToken: () => get().token,

  // Updates the active role in the store (future multi-role support).
  // Does not make an API call — caller is responsible for re-fetching scope.
  switchRole: (role) => {
    set((state) => ({
      user: state.user ? { ...state.user, role } : null,
    }));
  },
}));

// Cross-tab sync: the storage event only fires in OTHER tabs, so logging out
// (or in) in one tab updates the session everywhere without a reload.
window.addEventListener('storage', (event) => {
  if (event.key !== TOKEN_KEY) return;
  if (event.newValue === null) {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
  } else {
    useAuthStore.setState({
      user: readStoredUser(),
      token: event.newValue,
      isAuthenticated: true,
    });
  }
});
