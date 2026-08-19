import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarOpen: boolean;
  isMyRequests: boolean;

  toggleSidebar: () => void;
  toggleMyRequests: () => void;
  setMyRequests: (value: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      isMyRequests: false,

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleMyRequests: () => set((s) => ({ isMyRequests: !s.isMyRequests })),
      setMyRequests: (value) => set({ isMyRequests: value }),
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    }
  )
);
