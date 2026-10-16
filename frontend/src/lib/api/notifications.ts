import apiClient from './client';
import type { AppNotification } from '@/types';

export interface NotificationFeed {
  results: AppNotification[];
  unread_count: number;
  /** True when an older page exists; ask for it with `before`. */
  has_more?: boolean;
}

export interface NotificationQuery {
  unread?: boolean;
  eventTypes?: readonly string[];
  /** The id of the oldest row already shown. */
  before?: number;
  /** Rows per page; the server defaults to 50 and allows at most 100. */
  limit?: number;
}

/** The 50 most recent notifications for the caller, newest first.
 *
 *  The server counts the unread ones, so the badge does not stop at the page. */
export async function getNotifications(): Promise<NotificationFeed> {
  const { data } = await apiClient.get<NotificationFeed>('/notifications/');
  return { results: data.results ?? [], unread_count: data.unread_count ?? 0 };
}

/** One page of the feed, filtered server-side. The full Notifications page reads this. */
export async function getNotificationPage(query: NotificationQuery): Promise<NotificationFeed> {
  const params: Record<string, string> = {};
  if (query.unread) params.unread = '1';
  if (query.eventTypes?.length) params.event_type = query.eventTypes.join(',');
  if (query.before) params.before = String(query.before);
  if (query.limit) params.limit = String(query.limit);
  const { data } = await apiClient.get<NotificationFeed>('/notifications/', { params });
  return { results: data.results ?? [], unread_count: data.unread_count ?? 0, has_more: !!data.has_more };
}

// Trailing slashes matter: with APPEND_SLASH a non-GET to the slashless form is
// redirected, which turns it into a GET and then a 405.
export async function markRead(id: number): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read/`);
}

export async function markAllRead(): Promise<void> {
  await apiClient.post('/notifications/read-all/');
}

