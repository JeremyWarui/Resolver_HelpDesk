import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { SLACountdown } from './SLACountdown';
import type { Ticket } from '@/types';

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

interface TicketCardProps {
  ticket: Pick<Ticket, 'id' | 'ticket_no' | 'description' | 'status' | 'priority' | 'updated_at' | 'resolution_due_at' | 'paused_at'>;
  onClick?: () => void;
  showSLA?: boolean;
  className?: string;
}

export function TicketCard({ ticket, onClick, showSLA, className }: TicketCardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={cn(
        'flex flex-col gap-1.5 rounded-md border bg-card px-3 py-2.5 text-card-foreground shadow-sm',
        onClick && 'cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_no}</span>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
      </div>

      <p className="truncate text-sm font-medium leading-snug">
        {ticket.description || <span className="italic text-muted-foreground">No description</span>}
      </p>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{formatRelative(ticket.updated_at)}</span>
        {showSLA && ticket.resolution_due_at && (
          <SLACountdown
            dueDate={ticket.resolution_due_at}
            isPaused={!!ticket.paused_at}
            compact
            className="max-w-[140px]"
          />
        )}
      </div>
    </div>
  );
}
