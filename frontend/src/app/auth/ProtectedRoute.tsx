import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
}

/**
 * Gate a route on the session.
 *
 * No loading state: `useAuthStore` hydrates from localStorage synchronously at
 * module load, so whether there is a session is known on the first render.
 * There is nothing to wait for, and the spinner that used to sit here read an
 * `isLoading` that only a component's own login/logout call can set — which
 * this component never makes.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles = [],
}) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles.length > 0 && user) {
    const hasRequiredRole = requiredRoles.includes(user.role);
    
    if (!hasRequiredRole) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">
              You don't have permission to access this page.
            </p>
            <p className="text-sm text-gray-500">
              Required role: {requiredRoles.join(' or ')}<br />
              Your role: {user.role}
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};
