import { Outlet } from 'react-router-dom';
import { useUserData } from '@/hooks/users/useUserData';

// Top-level wrapper for all authenticated dashboard routes.
// Bootstraps the authStore user profile via React Query.
export function DashboardShell() {
  useUserData();
  return <Outlet />;
}
