import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { updateTicketStatus, addComment, getComments } from '@/lib/api/tickets';
import { useAuthStore } from '@/stores/authStore';
import type { Ticket } from '@/types';
import type { TicketComment } from '@/lib/api/tickets';

export type MobileTicketStatus = 'assigned' | 'in_progress' | 'pending' | 'resolved';

export function useMobileTickets() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery<Ticket[]>({
    queryKey: ['mobile-tickets', userId],
    queryFn: async () => {
      const { data } = await apiClient.get('/tickets/', {
        params: { assigned_to: userId, page_size: 50 },
      });
      return Array.isArray(data) ? data : (data.results ?? []);
    },
    enabled: userId != null,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

export function useMobileTicketDetail(ticketId: number | null) {
  return useQuery<Ticket>({
    queryKey: ['mobile-ticket', ticketId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/tickets/${ticketId}/`);
      return data;
    },
    enabled: ticketId != null,
    staleTime: 30 * 1000,
  });
}

export function useMobileTicketComments(ticketId: number | null) {
  return useQuery<TicketComment[]>({
    queryKey: ['mobile-ticket-comments', ticketId],
    queryFn: async () => {
      const result = await getComments(ticketId!);
      return result.results ?? [];
    },
    enabled: ticketId != null,
    staleTime: 30 * 1000,
  });
}

export function useUpdateTicketStatus(ticketId: number) {
  const qc = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  return useMutation({
    mutationFn: ({ status, reason }: { status: string; reason: string }) =>
      updateTicketStatus(ticketId, status, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-tickets', userId] });
      qc.invalidateQueries({ queryKey: ['mobile-ticket', ticketId] });
    },
  });
}

export function useAddComment(ticketId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addComment(ticketId, body, 'public'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-ticket', ticketId] });
      qc.invalidateQueries({ queryKey: ['mobile-ticket-comments', ticketId] });
    },
  });
}
