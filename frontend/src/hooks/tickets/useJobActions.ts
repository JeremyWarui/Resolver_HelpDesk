import { useState } from 'react';
import { toast } from 'sonner';
import { claimTicket, startWork } from '@/lib/api/tickets';
import { useTicketInvalidate } from './useTicketDetail';
import type { Ticket } from '@/types';

/** The two one-tap moves a technician makes on a job. */
export type OneTapAction = 'claim' | 'start';

/**
 * Which one-tap move this ticket offers the person `userId`, if any: claim
 * open work nobody holds, or start a job assigned to them. Time spent in
 * `assigned` is what the response-time SLA measures, so starting is one tap.
 */
export function oneTapAction(ticket: Ticket, userId: number | undefined): OneTapAction | null {
  if (ticket.status === 'open' && ticket.assigned_to == null) return 'claim';
  if (ticket.status === 'assigned' && ticket.assigned_to?.id === userId) return 'start';
  return null;
}

/**
 * Claim or start a job, with its message, and refresh what shows it. `busy`
 * holds the ids in flight, so a button can disable itself. `run` resolves to
 * whether the move went through.
 */
export function useJobActions() {
  const invalidate = useTicketInvalidate();
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());

  async function run(ticket: Ticket, action: OneTapAction): Promise<boolean> {
    setBusy((ids) => new Set(ids).add(ticket.id));
    try {
      if (action === 'claim') {
        await claimTicket(ticket.id);
        toast.success(`${ticket.ticket_no} is yours, and in progress.`);
      } else {
        await startWork(ticket.id);
        toast.success(`Started ${ticket.ticket_no}.`);
      }
      return true;
    } catch {
      toast.error(
        action === 'claim'
          ? 'Could not claim it. Someone may have taken it first.'
          : 'Could not start this job. Please try again.',
      );
      return false;
    } finally {
      setBusy((ids) => {
        const next = new Set(ids);
        next.delete(ticket.id);
        return next;
      });
      // Either way the ticket may have moved: refetch what shows it.
      invalidate(ticket.id);
    }
  }

  return { run, busy };
}
