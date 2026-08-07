import { create } from 'zustand';
import type { AppNotification } from '@/types';

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;

  setNotifications: (notifications: AppNotification[]) => void;
  addNotification: (notification: AppNotification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    }),

  addNotification: (notification) => {
    const { notifications } = get();
    // Deduplicate by id
    if (notifications.some((n) => n.id === notification.id)) return;
    const next = [notification, ...notifications];
    set({ notifications: next, unreadCount: next.filter((n) => !n.read).length });
  },

  markRead: (id) => {
    const next = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    set({ notifications: next, unreadCount: next.filter((n) => !n.read).length });
  },

  markAllRead: () => {
    const next = get().notifications.map((n) => ({ ...n, read: true }));
    set({ notifications: next, unreadCount: 0 });
  },

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));
