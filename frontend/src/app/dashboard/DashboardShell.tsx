import { Outlet } from 'react-router-dom';
import { useUserData } from '@/hooks/useAuth';

// The wrapper for every signed-in route. Re-validates the stored user against
// the server through `useUserData`.
export function DashboardShell() {
  useUserData();
  return <Outlet />;
}
