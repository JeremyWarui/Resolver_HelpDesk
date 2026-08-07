import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarOpen: boolean;
  activeModal: string | null;
  isMyRequests: boolean;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  openModal: (id: string) => void;
  closeModal: () => void;
  toggleMyRequests: () => void;
  setMyRequests: (value: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      activeModal: null,
      isMyRequests: false,

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      openModal: (id) => set({ activeModal: id }),
      closeModal: () => set({ activeModal: null }),
      toggleMyRequests: () => set((s) => ({ isMyRequests: !s.isMyRequests })),
      setMyRequests: (value) => set({ isMyRequests: value }),
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    }
  )
);
