import apiClient from './client';
import type { AppNotification } from '@/types';

export interface NotificationFeed {
  results: AppNotification[];
  unread_count: number;
}

/** The 50 most recent notifications for the caller, newest first.
 *
 *  The server counts the unread ones, so the badge does not stop at the page. */
export async function getNotifications(): Promise<NotificationFeed> {
  const { data } = await apiClient.get<NotificationFeed>('/notifications/');
  return { results: data.results ?? [], unread_count: data.unread_count ?? 0 };
}

// Trailing slashes matter: with APPEND_SLASH a non-GET to the slashless form is
// redirected, which turns it into a GET and then a 405.
export async function markRead(id: number): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read/`);
}

export async function markAllRead(): Promise<void> {
  await apiClient.post('/notifications/read-all/');
}

