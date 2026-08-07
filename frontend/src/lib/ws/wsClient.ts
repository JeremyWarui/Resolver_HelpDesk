// lib/ws/wsClient.ts — Native WebSocket client for Django Channels backend
//
// Connection URL: ws(s)://host/ws/?token=<jwt-access-token>
// Token is the JWT access token read from the auth store.
// Django Channels middleware validates the token in the consumer handshake.
//
// Channel naming uses underscores (Django Channels group name constraint):
//   user_{userId}
//   section_{sectionId}
//   ticket_{ticketId}   — transient, joined/left on TicketDetailPage mount/unmount
//   system_{campusId}   — admin only

import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';
import { clearSessionAndRedirect } from '@/lib/api/client';
import type { AppNotification, NotificationEventType, UserScope } from '@/types';

// In production, VITE_WS_URL_PROD overrides (set for real deployments).
// Fallback: auto-detect from current origin so preview proxy and same-origin
// deployments work without any env var — wss:// when served over HTTPS.
const WS_URL =
  import.meta.env.MODE === 'production'
    ? (import.meta.env.VITE_WS_URL_PROD ??
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/`)
    : (import.meta.env.VITE_WS_URL_DEV ?? 'ws://localhost:8000/ws/');

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;   // starts at 1 s, doubles up to 30 s
let isIntentionalClose = false;

// Tracks channels to re-join after reconnect
const activeChannels = new Set<string>();

// queryClient is injected at connect time to avoid a circular import
let _invalidateQueries: ((key: unknown[]) => void) | null = null;

export function wsInit(invalidateQueries: (key: unknown[]) => void): void {
  _invalidateQueries = invalidateQueries;
}

export function wsConnect(): void {
  const token = useAuthStore.getState().getToken();
  if (!token) return;

  isIntentionalClose = false;
  const url = `${WS_URL}?token=${token}`;
  socket = new WebSocket(url);

  socket.onopen = () => {
    reconnectDelay = 1000;
    // Re-join all tracked channels after (re)connect
    activeChannels.forEach(ch => wsSend('join', { channel: ch }));
  };

  socket.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as WsMessage;
      handleWsEvent(msg);
    } catch {
      // Ignore unparseable frames
    }
  };

  socket.onclose = (event: CloseEvent) => {
    if (!isIntentionalClose && event.code !== 1000) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    scheduleReconnect();
  };
}

export function wsDisconnect(): void {
  isIntentionalClose = true;
  activeChannels.clear();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close(1000);
  socket = null;
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    wsConnect();
  }, reconnectDelay);
}

function wsSend(type: string, data: Record<string, unknown>): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, ...data }));
  }
}

export function joinChannel(channel: string): void {
  activeChannels.add(channel);
  wsSend('join', { channel });
}

export function leaveChannel(channel: string): void {
  activeChannels.delete(channel);
  wsSend('leave', { channel });
}

export function wsSubscribeChannels(scope: UserScope): void {
  joinChannel(`user_${scope.userId}`);

  if (scope.sectionIds.length > 0) {
    scope.sectionIds.forEach(sectionId => {
      joinChannel(`section_${sectionId}`);
    });
  }

  if (scope.role === 'admin' && scope.campusId !== null) {
    joinChannel(`system_${scope.campusId}`);
  }
}

// ── Event → React Query invalidation map ─────────────────────────────────────

interface WsMessage {
  type: string;
  ticketId?: string | number;
  [key: string]: unknown;
}

function invalidate(key: unknown[]): void {
  _invalidateQueries?.(key);
}

function handleWsEvent(msg: WsMessage): void {
  switch (msg.type) {
    case 'ticket_created':
      invalidate(['tickets']);
      invalidate(['analytics']);
      useNotificationStore.getState().addNotification(
        buildNotification(msg, 'ticket_created', 'New ticket raised', `Ticket #${msg.ticket_no ?? ''} has been submitted.`)
      );
      break;

    case 'ticket_assigned':
      invalidate(['ticket', msg.ticketId]);
      invalidate(['tickets']);
      invalidate(['analytics']);
      useNotificationStore.getState().addNotification(
        buildNotification(msg, 'ticket_assigned', 'Ticket assigned', `Ticket #${msg.ticket_no ?? ''} assigned to ${(msg.assignedToName as string) ?? 'a technician'}.`)
      );
      break;

    case 'ticket_status_changed':
      invalidate(['ticket', msg.ticketId]);
      invalidate(['tickets']);
      invalidate(['analytics']);
      useNotificationStore.getState().addNotification(
        buildNotification(msg, 'ticket_status_changed', 'Ticket updated', `Ticket #${msg.ticket_no ?? ''} status changed to ${(msg.toStatus as string) ?? ''}.`)
      );
      break;

    case 'comment_added':
      invalidate(['ticket', msg.ticketId, 'comments']);
      break;

    case 'ticket_escalated':
      invalidate(['tickets']);
      useNotificationStore.getState().addNotification(
        buildNotification(msg, 'ticket_escalated', 'Ticket escalated', `Ticket #${msg.ticket_no ?? ''} has been escalated.`)
      );
      break;

    case 'ticket_resolved':
      invalidate(['ticket', msg.ticketId]);
      // The resolve transition must also refresh the requester's table and
      // stat cards — this event replaces ticket_status_changed for resolved.
      invalidate(['tickets']);
      invalidate(['analytics']);
      useNotificationStore.getState().addNotification(
        buildNotification(msg, 'ticket_resolved', 'Ticket resolved', 'Your request has been resolved.')
      );
      break;

    case 'sla_warning':
      invalidate(['sla']);
      invalidate(['tickets']);
      useNotificationStore.getState().addNotification(
        buildNotification(msg, 'sla_warning', 'SLA warning', `Ticket ${msg.ticket_no ?? ''} is approaching its deadline.`)
      );
      break;

    case 'sla_breach':
      invalidate(['sla']);
      invalidate(['tickets']);
      break;

    case 'section_summary':
      invalidate(['analytics']);
      break;

    case 'role_changed':
      // Pushed the instant an admin/HOD promotes/demotes this user's primary
      // role, or edits an active cover assignment's window. Same forced-
      // relogin path the apiClient refresh interceptor uses when it detects
      // a stale role — this just gets there immediately instead of waiting
      // on the next silent token refresh.
      clearSessionAndRedirect('role-changed');
      break;

    default:
      break;
  }
}

function buildNotification(
  msg: WsMessage,
  eventType: NotificationEventType,
  title: string,
  body: string
): AppNotification {
  return {
    id: `ws-${eventType}-${msg.ticketId ?? Date.now()}`,
    eventType,
    title,
    body,
    ticketId: msg.ticketId ? String(msg.ticketId) : null,
    read: false,
    createdAt: new Date().toISOString(),
  };
}
