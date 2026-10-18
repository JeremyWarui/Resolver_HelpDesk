import { Outlet } from 'react-router-dom';
import { useRoleCheck } from '@/hooks/useAuth';

// The wrapper for every signed-in route. Re-checks the stored role against
// the server through `useRoleCheck`.
export function DashboardShell() {
  useRoleCheck();
  return <Outlet />;
}
