/**
 * Resume a held job, or re-code why it is still held.
 *
 * Two modes because they are genuinely different events and conflating them
 * corrupts the history: parts arrived and work restarted is one fact; parts
 * arrived but nobody is free is another. Without `change`, the second gets
 * recorded as a resume followed immediately by a fresh hold, and the reporting
 * shows two short stoppages where there was one long one.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DialogActions } from '@/components/shared/forms/DialogActions';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateTicketStatus } from '@/lib/api/tickets';
import { useTicketInvalidate } from '@/hooks/tickets/useTicketDetail';
import { useTicketFilterOptions } from '@/hooks/tickets/useTickets';
import type { Ticket } from '@/types';
import { noteAudience } from '@/constants/notifications';
import { useRole } from '@/lib/auth/permissions';

interface Props {
  ticket: Ticket;
  /** 'resume' puts the job back in progress; 'change' keeps it held. */
  mode: 'resume' | 'change';
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function ResumeWorkModal({ ticket, mode, open, onClose, onDone }: Props) {
  const role = useRole();
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const invalidate = useTicketInvalidate();

  // Server-owned vocabulary, shared cache with the tickets-table filters.
  const { pendingReasons } = useTicketFilterOptions(open);

  const isResume = mode === 'resume';
  const needsNote = !isResume && reason === 'other';
  const canSubmit = isResume
    ? note.trim().length >= 3
    : reason !== '' && reason !== ticket.pending_reason && (!needsNote || note.trim() !== '');

  function handleClose() {
    setNote('');
    setReason('');
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (isResume) {
        // Back to in_progress — the server clears the reason and restarts the
        // SLA clock from where it froze.
        await updateTicketStatus(ticket.id, 'in_progress', note.trim());
        toast.success(`${ticket.ticket_no} resumed`);
      } else {
        // Still held, new cause. The server ends one hold and begins another,
        // and sends one message about it.
        await updateTicketStatus(ticket.id, 'pending', '', reason, note.trim());
        toast.success(`${ticket.ticket_no} — reason updated`);
      }
      invalidate(ticket.id);
      handleClose();
      onDone();
    } catch {
      toast.error(
        isResume ? 'Could not resume this job.' : 'Could not update the reason.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="w-[520px] max-w-[90vw]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>{isResume ? 'Resume work' : 'Change the reason'}</DialogTitle>
            <span className="font-mono text-sm text-muted-foreground">
              #{ticket.ticket_no}
            </span>
          </div>
          <DialogDescription>
            {isResume
              ? 'The job goes back to in progress and the SLA clock starts again from where it stopped.'
              : 'The job stays on hold. Use this when the first blocker cleared but another one took its place.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Currently waiting for
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {ticket.pending_reason_display || '—'}
            </p>
            {ticket.pending_reason_note && (
              <p className="text-sm text-muted-foreground">{ticket.pending_reason_note}</p>
            )}
          </div>

          {!isResume && (
            <div className="space-y-2">
              <Label htmlFor="rw-reason">
                Now waiting for <span className="text-destructive">*</span>
              </Label>
              <Select value={reason} onValueChange={setReason} disabled={submitting}>
                <SelectTrigger id="rw-reason">
                  <SelectValue placeholder="Select the new reason" />
                </SelectTrigger>
                <SelectContent>
                  {pendingReasons
                    .filter((c) => c.value !== ticket.pending_reason)
                    .map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rw-note">
              {isResume ? 'What changed' : 'Additional details'}
              {isResume || needsNote ? (
                <span className="ml-1 text-destructive">*</span>
              ) : (
                <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
              )}
            </Label>
            <Textarea
              id="rw-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                isResume
                  ? 'e.g. Hinges collected from the store this morning.'
                  : 'e.g. Parts arrived, but no carpenter free until Monday.'
              }
              rows={3}
              disabled={submitting}
            />
            {/* Resuming and changing the reason both reach the requester and the HOS. */}
            <p className="text-xs text-muted-foreground">{noteAudience(true, role)}</p>
          </div>
        </div>

        <DialogActions
          onCancel={handleClose}
          onSubmit={handleSubmit}
          pending={submitting}
          disabled={!canSubmit}
          submitLabel={isResume ? 'Resume work' : 'Update reason'}
        />
      </DialogContent>
    </Dialog>
  );
}
