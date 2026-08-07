import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/shared/ticket/StatusBadge';
import { updateTicketStatus } from '@/lib/api/tickets';
import { useTicketInvalidate } from '@/hooks/tickets/useTicketDetail';
import { PENDING_REASON_CHOICES } from '@/constants/tickets';
import type { Ticket } from '@/types';

// Mirror of the backend ALLOWED map (apps/tickets/services/lifecycle.py),
// restricted to the transitions a technician drives. Keep the two in sync.
const VALID_NEXT: Partial<Record<Ticket['status'], Ticket['status'][]>> = {
  assigned:    ['in_progress'],
  in_progress: ['pending', 'resolved'],
  pending:     ['in_progress', 'resolved'],
};

const STATUS_LABEL: Record<string, string> = {
  open:        'Return to queue (open)',
  in_progress: 'Start work (in progress)',
  pending:     'On hold (pending)',
  resolved:    'Mark as resolved',
};

interface StatusUpdateModalProps {
  ticket: Ticket;
  open: boolean;
  onClose: () => void;
  onSuccess: (updated: Ticket) => void;
}

export function StatusUpdateModal({ ticket, open, onClose, onSuccess }: StatusUpdateModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [note, setNote] = useState('');
  const [pendingReason, setPendingReason] = useState('');
  const [pendingComment, setPendingComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const invalidate = useTicketInvalidate();

  const validNextStatuses = VALID_NEXT[ticket.status] ?? [];
  const needsPendingReason = selectedStatus === 'pending';
  const canSubmit =
    selectedStatus !== '' &&
    note.trim().length >= 3 &&
    (!needsPendingReason || pendingReason !== '');

  function handleClose() {
    setSelectedStatus('');
    setNote('');
    setPendingReason('');
    setPendingComment('');
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const reason = needsPendingReason
        ? [pendingReason, pendingComment.trim()].filter(Boolean).join(' — ')
        : note.trim();
      const updated = await updateTicketStatus(ticket.id, selectedStatus, reason);
      toast.success(`Ticket status updated to "${STATUS_LABEL[selectedStatus] ?? selectedStatus}"`);
      invalidate(ticket.id);
      handleClose();
      onSuccess(updated);
    } catch {
      toast.error('Failed to update ticket status. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (validNextStatuses.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="w-[560px] max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Update ticket status</DialogTitle>
            <span className="text-sm text-muted-foreground font-mono">
              #{ticket.ticket_no}
            </span>
          </div>
          <DialogDescription>
            Change the status of this ticket and add a progress note.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Current status */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Current status:</span>
            <StatusBadge status={ticket.status} />
          </div>

          {/* Status radio cards */}
          <div className="space-y-2">
            {validNextStatuses.map((s) => {
              const isSelected = selectedStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedStatus(s)}
                  disabled={submitting}
                  className={[
                    'w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/50',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      isSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground bg-transparent',
                    ].join(' ')}
                  >
                    {isSelected && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </span>
                  <StatusBadge status={s} />
                </button>
              );
            })}
          </div>

          {/* Progress note section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Progress note <span className="text-destructive">*</span>
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
            <Textarea
              id="su-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe what was done or what changed…"
              rows={5}
              disabled={submitting}
            />
          </div>

          {/* Attachments section — placeholder only */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Attachments
              </span>
              <span className="text-xs font-medium text-primary uppercase tracking-wide">
                Optional
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
              Add photo or file
            </div>
          </div>

          {/* Pending reason — required only when moving to pending */}
          {needsPendingReason && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    Reason for hold <span className="text-destructive">*</span>
                  </span>
                  <div className="flex-1 border-t border-border" />
                </div>
                <Select value={pendingReason} onValueChange={setPendingReason} disabled={submitting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {PENDING_REASON_CHOICES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="su-pending-comment">
                  Additional details
                  <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="su-pending-comment"
                  value={pendingComment}
                  onChange={(e) => setPendingComment(e.target.value)}
                  placeholder="e.g. Waiting for replacement parts to arrive from the supplier…"
                  rows={2}
                  disabled={submitting}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? 'Saving…' : 'Save update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
