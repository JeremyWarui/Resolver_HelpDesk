import { useEffect } from 'react';
import { useScope } from '@/lib/auth/roleContext';
import { wsConnect, wsDisconnect, wsSubscribeChannels } from '@/lib/ws/wsClient';

// Manages WebSocket lifecycle tied to the authenticated user's scope.
// Call once at the app root (inside RoleProvider) after login.
export function useWsChannels(): void {
  const scope = useScope();

  useEffect(() => {
    if (!scope) return;

    wsConnect();
    // Channels are stored in activeChannels and flushed in socket.onopen,
    // so registering them here is safe even before the connection opens.
    wsSubscribeChannels(scope);

    return () => {
      wsDisconnect();
    };
    // Intentionally subscribe to scalar fields only: reconnect on userId/role change,
    // not on every scope object reference change (login/logout or useSwitchRole).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.userId, scope?.role]);
}
