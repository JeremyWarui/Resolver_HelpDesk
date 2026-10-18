import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTicketById, getTicketTimeline, getAttachments, getComments } from '@/lib/api/tickets';
import type { TicketAttachmentRow, TicketComment } from '@/lib/api/tickets';
import type { Ticket, TicketTimelineEvent } from '@/types';

interface UseTicketDetailResult {
  ticket: Ticket | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface UseTicketTimelineResult {
  events: TicketTimelineEvent[];
  loading: boolean;
}

export function useTicketDetail(ticketId: number | null): UseTicketDetailResult {
  const { data, isLoading, error, refetch } = useQuery<Ticket>({
    queryKey: ['ticket', ticketId],
    queryFn: () => getTicketById(ticketId!),
    enabled: ticketId != null,
    staleTime: 30 * 1000,
  });

  return {
    ticket: data ?? null,
    loading: isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTicketTimeline(ticketId: number | null): UseTicketTimelineResult {
  const { data, isLoading } = useQuery<TicketTimelineEvent[]>({
    queryKey: ['ticket', ticketId, 'timeline'],
    queryFn: () => getTicketTimeline(ticketId!),
    enabled: ticketId != null,
    staleTime: 0,
    retry: 1,
  });

  return { events: data ?? [], loading: isLoading };
}

export function useTicketAttachments(ticketId: number | null) {
  const { data, isLoading } = useQuery<TicketAttachmentRow[]>({
    queryKey: ['ticket', ticketId, 'attachments'],
    queryFn: () => getAttachments(ticketId!),
    enabled: ticketId != null,
    staleTime: 30 * 1000,
  });

  return { attachments: data ?? [], loading: isLoading };
}

export function useTicketComments(ticketId: number | null) {
  const { data, isLoading } = useQuery<TicketComment[]>({
    queryKey: ['ticket-comments', ticketId],
    queryFn: async () => (await getComments(ticketId!)).results,
    enabled: ticketId != null,
    staleTime: 60 * 1000,
  });

  return { comments: data ?? [], loading: isLoading };
}

export function useTicketInvalidate() {
  const queryClient = useQueryClient();
  return (ticketId?: number) => {
    if (ticketId) {
      // A prefix: the ticket, its timeline and its attachments.
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['ticket-comments', ticketId] });
    }
    // Every list, the sidebar counts with them, and the figures.
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  };
}
