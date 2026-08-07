/**
 * OfflineQueue — invisible component that watches for connectivity.
 *
 * When the device comes back online it replays any queued mutations
 * stored in localStorage (status updates and comments submitted offline).
 *
 * Storage key: "resolver_offline_queue"
 * Entry shape: { id, type, ticketId, payload, timestamp }
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';

const QUEUE_KEY = 'resolver_offline_queue';

interface QueueEntry {
  id: string;
  type: 'status' | 'comment';
  ticketId: number;
  payload: Record<string, unknown>;
  timestamp: number;
}

export function readQueue(): QueueEntry[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch { return []; }
}

export function enqueueAction(entry: Omit<QueueEntry, 'id' | 'timestamp'>) {
  const queue = readQueue();
  queue.push({ ...entry, id: crypto.randomUUID(), timestamp: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function removeEntry(id: string) {
  const queue = readQueue().filter(e => e.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function replayEntry(entry: QueueEntry): Promise<void> {
  if (entry.type === 'status') {
    await apiClient.post(`/tickets/${entry.ticketId}/status/`, entry.payload);
  } else if (entry.type === 'comment') {
    await apiClient.post(`/tickets/${entry.ticketId}/comments/`, entry.payload);
  }
}

interface Props { isOnline: boolean }

export function OfflineQueue({ isOnline }: Props) {
  const prevOnline = useRef(isOnline);

  useEffect(() => {
    if (!prevOnline.current && isOnline) {
      // Came back online — replay queue
      const queue = readQueue();
      if (queue.length === 0) return;

      toast.info(`Syncing ${queue.length} offline action${queue.length > 1 ? 's' : ''}…`);

      Promise.allSettled(queue.map(async entry => {
        try {
          await replayEntry(entry);
          removeEntry(entry.id);
        } catch {
          // Leave in queue — will retry next reconnect
        }
      })).then(results => {
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
          toast.error(`${failed} action${failed > 1 ? 's' : ''} failed to sync. Will retry.`);
        } else if (queue.length > 0) {
          toast.success('Offline actions synced successfully');
        }
      });
    }
    prevOnline.current = isOnline;
  }, [isOnline]);

  return null;
}
