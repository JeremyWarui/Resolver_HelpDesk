import apiClient from './client';
import type { AppNotification } from '@/types';

export async function getNotifications(): Promise<AppNotification[]> {
  const { data } = await apiClient.get<{ data: AppNotification[]; unreadCount: number }>(
    '/notifications/'
  );
  return data.data ?? [];
}

export async function markRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  await apiClient.post('/notifications/read-all');
}

const notificationsService = {
  getNotifications,
  markRead,
  markAllRead,
};

export default notificationsService;
