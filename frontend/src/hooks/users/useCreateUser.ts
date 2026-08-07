import { useState } from 'react';
import usersService from '@/lib/api/users';
import type { CreateUserPayload, User } from '@/types';

interface UseCreateUserResult {
  createUser: (data: CreateUserPayload) => Promise<User>;
  loading: boolean;
  error: Error | null;
}

export const useCreateUser = (): UseCreateUserResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createUser = async (data: CreateUserPayload) => {
    setLoading(true);
    setError(null);
    try {
      const result = await usersService.createUser(data);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to create user');
      setError(e);
      console.error('createUser error', err);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return { createUser, loading, error };
};

export default useCreateUser;
