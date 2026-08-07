// RatingModal — user rates a resolved ticket and closes it (Rate & Close).
// Shows the technician's resolution note when available so the requester can
// read what was done before rating (QA D2). Reopen is a separate standalone
// action on the ticket detail page (QA B2c).

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
import { addFeedback, closeTicket } from '@/lib/api/tickets';
import { useTicketInvalidate } from '@/hooks/tickets/useTicketDetail';
import type { Ticket } from '@/types';
import type { RatingSubmitPayload } from '@/components/shared/ticket/RatingWidget';

interface RatingModalProps {
  ticket: Ticket;
  open: boolean;
  onClose: () => void;
  onSuccess: (updated: Ticket) => void;
  /** The technician's resolution note (from the resolved timeline event). */
  resolutionNote?: string | null;
}

export function RatingModal({ ticket, open, onClose, onSuccess, resolutionNote }: RatingModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const invalidate = useTicketInvalidate();

  async function handleSubmit({ rating, comment }: RatingSubmitPayload) {
    setSubmitting(true);
    try {
      await addFeedback(ticket.id, rating, comment);
      const updated = await closeTicket(ticket.id);
      toast.success('Feedback submitted. Ticket closed.');
      invalidate(ticket.id);
      onSuccess(updated);
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
          <RatingWidget onSubmit={handleSubmit} submitting={submitting} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
