import { useQueryClient } from '@tanstack/react-query';

/** The admin's account register. */
export const USERS_KEY = ['admin', 'users'] as const;

/** After an account changes: the register, every technician list, and the
 *  figures that count staff, so no page shows the old person. */
export function useRefreshPeople() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: USERS_KEY });
    queryClient.invalidateQueries({ queryKey: ['technicians'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  };
}
