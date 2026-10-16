// Rate a resolved ticket. The server closes it in the same request.
//
// The technician's resolution note is shown above the stars where there is
// one, so the requester rates what was actually done rather than from memory.

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RatingWidget } from '@/components/shared/ticket/RatingWidget';
import { addFeedback } from '@/lib/api/tickets';
import { useTicketInvalidate, useTicketTimeline } from '@/hooks/tickets/useTicketDetail';
import type { Ticket } from '@/types';
import type { RatingSubmitPayload } from '@/components/shared/ticket/RatingWidget';

interface RatingModalProps {
  ticket: Ticket;
  open: boolean;
  onClose: () => void;
  onSuccess: (updated: Ticket) => void;
  /** The technician's resolution note (from the resolved timeline event). */
  resolutionNote?: string | null;
  /** Stars picked before opening, e.g. on the dashboard's rating column. */
  initialRating?: number;
}

export function RatingModal({
  ticket, open, onClose, onSuccess, resolutionNote: givenNote, initialRating,
}: RatingModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const invalidate = useTicketInvalidate();
  // Opened from a list row, nobody has read the timeline yet, so read it here.
  const { events } = useTicketTimeline(givenNote === undefined && open ? ticket.id : null);
  const resolutionNote = givenNote !== undefined
    ? givenNote
    : [...events].reverse().find((e) => e.event_type === 'resolved')?.note ?? null;

  async function handleSubmit({ rating, comment }: RatingSubmitPayload) {
    setSubmitting(true);
    try {
      const result = await addFeedback(ticket.id, rating, comment);
      toast.success('Feedback submitted. Ticket closed.');
      invalidate(ticket.id);
      onSuccess({ ...ticket, status: result.status, has_feedback: true });
    } catch {
      toast.error('Action failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate resolution</DialogTitle>
          <DialogDescription>
            Rate how well your request was resolved and close the ticket.
          </DialogDescription>
        </DialogHeader>

        {resolutionNote && (
          <div className="rounded-md border bg-muted/40 px-3.5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Resolution
            </p>
            <p className="text-sm whitespace-pre-wrap">{resolutionNote}</p>
          </div>
        )}

        <div className="py-2">
          <RatingWidget onSubmit={handleSubmit} submitting={submitting} initialRating={initialRating} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
