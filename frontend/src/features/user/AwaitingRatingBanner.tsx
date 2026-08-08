import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Ticket } from '@/types';

/**
 * "You have resolved tickets still waiting for a rating."
 *
 * Shown only when there are any. A permanent nav item would sit empty for
 * someone who raises three tickets a year; the nudge is worth making only at
 * the moment there is something to act on.
 *
 * Without it the rating is reachable solely via "Rate & close" on the ticket
 * detail, so a requester who never reopens the ticket leaves it unrated — and
 * the section's satisfaction figure ends up built from whoever happened to
 * click through.
 */
export function AwaitingRatingBanner({
  tickets,
  onRate,
}: {
  tickets: Ticket[];
  onRate: (ticketId: number) => void;
}) {
  const awaiting = tickets.filter((t) => t.status === 'resolved' && !t.has_feedback);
  if (awaiting.length === 0) return null;

  const [first] = awaiting;
  const rest = awaiting.length - 1;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
      <Star className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
      <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
        {awaiting.length === 1 ? (
          <>
            <span className="font-medium">{first.ticket_no}</span> has been resolved —
            how did it go?
          </>
        ) : (
          <>
            <span className="font-medium">{awaiting.length} resolved tickets</span> are
            waiting for your rating.
          </>
        )}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-300 bg-background hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40"
        onClick={() => onRate(first.id)}
      >
        {rest > 0 ? `Rate ${first.ticket_no}` : 'Rate it'}
      </Button>
    </div>
  );
}

export default AwaitingRatingBanner;
