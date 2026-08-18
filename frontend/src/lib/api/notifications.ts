import apiClient from './client';
import type { AppNotification } from '@/types';

export interface NotificationFeed {
  notifications: AppNotification[];
  unreadCount: number;
}

/** The 50 most recent notifications for the caller, newest first.
 *
 *  The server counts the unread ones — the client must not derive that from
 *  the page it happens to be holding, or the badge quietly caps at 50. */
export async function getNotifications(): Promise<NotificationFeed> {
  const { data } = await apiClient.get<{ data: AppNotification[]; unreadCount: number }>(
    '/notifications/'
  );
  return { notifications: data.data ?? [], unreadCount: data.unreadCount ?? 0 };
}

export async function markRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  // Trailing slash matters: the route is `notifications/read-all/`, and with
  // APPEND_SLASH a POST to the slashless form is redirected — which turns it
  // into a GET and then a 405.
  await apiClient.post('/notifications/read-all/');
}

