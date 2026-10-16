import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSystemFeedback,
  sendSystemFeedback,
  setSystemFeedbackReviewed,
} from '@/lib/api/systemFeedback';

const KEY = ['system-feedback'] as const;

/** The newest 100 entries a status covers; the admin's System Feedback page. */
export function useSystemFeedbackList(status: 'new' | 'reviewed' | undefined) {
  const query = useQuery({
    queryKey: [...KEY, 'list', status ?? 'all'],
    queryFn: () => getSystemFeedback({ status, page_size: 100 }),
  });
  return {
    entries: query.data?.results ?? [],
    total: query.data?.count ?? 0,
    loading: query.isLoading,
  };
}

/** How many entries nobody has reviewed: the admin's sidebar badge. */
export function useNewSystemFeedbackCount(enabled: boolean): number {
  const query = useQuery({
    queryKey: [...KEY, 'new-count'],
    queryFn: () => getSystemFeedback({ status: 'new', page_size: 1 }),
    enabled,
    staleTime: 60_000,
  });
  return query.data?.count ?? 0;
}

export function useMarkSystemFeedbackReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reviewed }: { id: number; reviewed: boolean }) =>
      setSystemFeedbackReviewed(id, reviewed),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSendSystemFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendSystemFeedback,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
