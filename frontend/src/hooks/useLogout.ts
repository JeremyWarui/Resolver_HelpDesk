import { useState } from 'react';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

/**
 * Custom hook for handling logout functionality
 * Consolidates logout logic and redirects to auth page
 * Provides loading state for UI feedback
 * 
 * @returns Object with handleLogout function and isLoading state
 * 
 * @example
 * const { handleLogout, isLoading } = useLogout();
 * 
 * <button onClick={handleLogout} disabled={isLoading}>
 *   {isLoading ? 'Logging out...' : 'Logout'}
 * </button>
 */
export const useLogout = () => {
  const { logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await logout();
      toast.success('Logged out successfully');
      window.location.href = '/login';
    } catch (error) {
      setIsLoading(false);
      toast.error('Failed to logout');
      console.error('Logout error:', error);
    }
  };

  return { handleLogout, isLoading };
};

export default useLogout;
