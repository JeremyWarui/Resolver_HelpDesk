// Where a ticket is in its life, as five steps. A hold takes the place of
// In Progress, because it can only follow work having started.

import { Check, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_LABELS, STATUS_TOKEN } from '@/constants/tickets';
import type { Ticket } from '@/types';

const STEPS: Ticket['status'][] = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];

const STEP_OF: Record<Ticket['status'], number> = {
  open: 0,
  assigned: 1,
  in_progress: 2,
  pending: 2,
  resolved: 3,
  closed: 4,
};

/** Steps reached carry the status's own colour, the one its badge wears, with
 *  a tick once passed; the rest are grey. */
export function TicketProgress({ status, className }: { status: Ticket['status']; className?: string }) {
  const current = STEP_OF[status];
  const onHold = status === 'pending';
  const finished = status === 'closed';
  const colour = `var(${STATUS_TOKEN[status]}-text)`;

  return (
    <ol aria-label="Progress" className={cn('flex items-start', className)}>
      {STEPS.map((step, i) => {
        const done = i < current || (finished && i === current);
        const isCurrent = i === current;
        const reached = i <= current;
        return (
          <li
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center text-center"
          >
            {/* The line runs from the previous step's dot to this one. */}
            {i > 0 && (
              <span
                aria-hidden
                className="absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2"
                style={{ backgroundColor: reached ? colour : 'var(--border)' }}
              />
            )}
            <span
              aria-hidden
              className={cn(
                'relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold',
                reached ? 'text-white' : 'border-gray-300 bg-white text-gray-600',
              )}
              style={reached ? { backgroundColor: colour, borderColor: colour } : undefined}
            >
              {done ? <Check className="h-3.5 w-3.5" />
                : isCurrent && onHold ? <Pause className="h-3 w-3" />
                : i + 1}
            </span>
            <span
              className={cn(
                'mt-1.5 text-[11px] leading-tight',
                isCurrent ? 'font-semibold text-gray-900' : reached ? 'text-gray-700' : 'text-gray-600',
              )}
            >
              {isCurrent && onHold ? STATUS_LABELS.pending : STATUS_LABELS[step]}
              {done && !isCurrent && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
