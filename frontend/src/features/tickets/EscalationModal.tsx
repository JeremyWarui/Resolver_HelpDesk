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
import { escalateTicket } from '@/lib/api/tickets';
import { useTicketInvalidate } from '@/hooks/tickets/useTicketDetail';
import type { Ticket } from '@/types';

type EscalationLevel = 'hod' | 'reassign';

interface EscalationModalProps {
  ticket: Ticket;
  open: boolean;
  onClose: () => void;
  onSuccess: (updated: Ticket) => void;
}

export function EscalationModal({ ticket, open, onClose, onSuccess }: EscalationModalProps) {
  const [level, setLevel] = useState<EscalationLevel | ''>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const invalidate = useTicketInvalidate();

  const canSubmit = level !== '' && reason.trim().length >= 10;

  function handleClose() {
    setLevel('');
    setReason('');
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit || !level) return;
    setSubmitting(true);
    try {
      const updated = await escalateTicket(ticket.id, level as EscalationLevel, reason.trim());
      toast.success(
        level === 'hod'
          ? 'Ticket escalated to Head of Department.'
          : 'Ticket reassigned to another section.'
      );
      invalidate(ticket.id);
      handleClose();
      onSuccess(updated);
    } catch {
      toast.error('Failed to escalate ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const escalationOptions: { value: EscalationLevel; label: string }[] = [
    { value: 'hod', label: 'Escalate to HOD' },
    { value: 'reassign', label: 'Reassign to another section' },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="w-[540px] max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-base font-semibold">Escalate ticket</DialogTitle>
            <span className="text-sm text-muted-foreground font-mono">#{ticket.ticket_no}</span>
          </div>
          <DialogDescription>
            Escalate this ticket to the next level and provide a reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <p className="text-sm text-destructive">
              Escalation will notify the Head of Department and flag this ticket as escalated.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Escalation Level <span className="text-destructive">*</span>
            </p>
            <div className="space-y-2">
              {escalationOptions.map((option) => {
                const selected = level === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLevel(option.value)}
                    disabled={submitting}
                    className={[
                      'w-full flex items-center justify-between rounded-md border px-4 py-3 text-left transition-colors',
                      selected
                        ? 'border-destructive/40 bg-destructive/5'
                        : 'border-border bg-background hover:bg-muted/50',
                    ].join(' ')}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    <div
                      className={[
                        'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                        selected ? 'border-destructive' : 'border-muted-foreground',
                      ].join(' ')}
                    >
                      {selected && (
                        <div className="h-2 w-2 rounded-full bg-destructive" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reason for Escalation <span className="text-destructive">*</span>
            </p>
            <Textarea
              id="esc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this ticket needs to be escalated and what has been attempted so far…"
              rows={4}
              disabled={submitting}
            />
            {reason.length > 0 && reason.trim().length < 10 && (
              <p className="text-xs text-destructive">
                Please provide a more detailed reason (at least 10 characters).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Priority Override
              <span className="text-xs font-medium normal-case tracking-normal text-muted-foreground/70">
                OPTIONAL
              </span>
            </p>
            <div className="border border-border rounded-md px-3 py-2 text-sm text-muted-foreground">
              Keep current priority
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? 'Escalating…' : 'Submit escalation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
