import { useState } from 'react';
import usersService from '@/lib/api/users';
import type { User } from '@/types';

interface UseUpdateUserResult {
  updateUser: (id: number, data: Partial<User>) => Promise<User>;
  loading: boolean;
  error: Error | null;
}

export const useUpdateUser = (): UseUpdateUserResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateUser = async (id: number, data: Partial<User>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await usersService.updateUser(id, data);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update user');
      setError(e);
      console.error('updateUser error', err);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { updateUser, loading, error };
};

export default useUpdateUser;
