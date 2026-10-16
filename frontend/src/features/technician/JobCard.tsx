import { Clock, Hand, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/ticket/StatusBadge';
import { PriorityBadge } from '@/components/shared/ticket/PriorityBadge';
import { EscalationBadge } from '@/components/shared/ticket/EscalationBadge';
import { timeLeft } from '@/utils/date';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

export type JobAction = 'start' | 'update' | 'claim';

const ACTION_LABEL: Record<JobAction, { text: string; Icon: React.ElementType }> = {
  start: { text: 'Start work', Icon: Play },
  update: { text: 'Update status', Icon: RefreshCw },
  claim: { text: 'Claim', Icon: Hand },
};

/**
 * One running job, as a technician weighs it: what and where, who raised it,
 * and how long is left. The card opens the ticket; the button does the next thing.
 */
export function JobCard({ ticket, action, busy, onOpen, onAction }: {
  ticket: Ticket;
  action: JobAction | null;
  busy?: boolean;
  onOpen: () => void;
  onAction?: () => void;
}) {
  const title = ticket.service_item?.name ?? ticket.trade?.name ?? 'Job';
  const late = !!ticket.is_breaching;
  const act = action ? ACTION_LABEL[action] : null;

  return (
    <article
      aria-label={`${title}, ${ticket.ticket_no}`}
      className="relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring"
    >
      <div className="flex-1">
        <div className="px-4 pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-auto font-mono text-[11px] text-gray-500">{ticket.ticket_no}</span>
            <EscalationBadge level={ticket.current_level} />
            {ticket.priority && <PriorityBadge priority={ticket.priority} />}
            <StatusBadge status={ticket.status} />
          </div>
          {/* The title opens the ticket, and its hit area covers the whole card. */}
          <button
            type="button"
            onClick={onOpen}
            className="mt-2 block text-left text-sm font-semibold text-gray-900 after:absolute after:inset-0 focus:outline-none"
          >
            {title}
          </button>
        </div>
        {/* The facts as a small details list, the way the Profile page sets them out. */}
        <dl className="grid grid-cols-2 border-t border-gray-100">
          <div className="px-4 py-2.5 border-r border-gray-100 min-w-0">
            <dt className="text-[11px] text-gray-500">Location</dt>
            <dd className="mt-0.5 text-sm text-gray-900 truncate">{ticket.facility ?? ticket.requester_campus?.name}</dd>
          </div>
          <div className="px-4 py-2.5 min-w-0">
            <dt className="text-[11px] text-gray-500">Raised by</dt>
            <dd className="mt-0.5 text-sm text-gray-900 truncate">{ticket.raised_by?.full_name}</dd>
          </div>
        </dl>
      </div>

      {/* Above the stretched title, so its button takes its own clicks. */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500">Time left</p>
          <p className={cn('flex items-center gap-1 text-sm font-medium', late ? 'text-red-700' : 'text-gray-900')}>
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {ticket.resolution_due_at ? timeLeft(ticket.resolution_due_at) : 'No target'}
          </p>
        </div>
        {act && onAction && (
          <Button
            size="sm"
            variant={action === 'update' ? 'outline' : 'default'}
            className="h-8 gap-1.5"
            disabled={busy}
            onClick={onAction}
          >
            <act.Icon className="h-3.5 w-3.5" aria-hidden />
            {busy ? 'Working…' : act.text}
          </Button>
        )}
      </div>
    </article>
  );
}
