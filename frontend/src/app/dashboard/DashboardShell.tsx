import { Outlet } from 'react-router-dom';
import { useWsChannels } from '@/hooks/useWsChannels';
import { useUserData } from '@/hooks/users/useUserData';

// Top-level wrapper for all authenticated dashboard routes.
// Bootstraps the authStore user profile via React Query and mounts the WebSocket connection.
export function DashboardShell() {
  useUserData();
  useWsChannels();
  return <Outlet />;
}
