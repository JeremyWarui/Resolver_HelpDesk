import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getUsers } from '@/lib/api/users';

const USERS_KEY = ['admin', 'users'] as const;

/** Users list for the admin Users page, cached by react-query.
 * Call refresh() after any create/update/delete. */
export function useUsersData() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: USERS_KEY,
    queryFn: async () => (await getUsers()).results,
  });

  useEffect(() => {
    if (query.error) toast.error('Failed to load users');
  }, [query.error]);

  return {
    users: query.data ?? [],
    loading: query.isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  };
}
