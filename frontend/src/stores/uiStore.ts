import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarOpen: boolean;
  isMyRequests: boolean;
  /** Who has dismissed the desk roles' "made for a computer" line on a phone.
   *  Kept per account, since a phone can be shared. */
  phoneNoticeDismissedBy: number[];

  toggleSidebar: () => void;
  toggleMyRequests: () => void;
  setMyRequests: (value: boolean) => void;
  dismissPhoneNotice: (userId: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      isMyRequests: false,
      phoneNoticeDismissedBy: [],

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleMyRequests: () => set((s) => ({ isMyRequests: !s.isMyRequests })),
      setMyRequests: (value) => set({ isMyRequests: value }),
      dismissPhoneNotice: (userId) =>
        set((s) => ({ phoneNoticeDismissedBy: [...new Set([...s.phoneNoticeDismissedBy, userId])] })),
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        phoneNoticeDismissedBy: state.phoneNoticeDismissedBy,
      }),
    }
  )
);
