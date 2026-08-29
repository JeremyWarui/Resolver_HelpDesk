/**
 * How far a ticket has climbed, marked beside its status.
 *
 * It sits in the status cell rather than a column of its own: escalation is a
 * fact about where a ticket stands, and `status` is the one column no variant
 * hides. Renders nothing at `technician` — the default is no badge, not a
 * badge reading "normal".
 */
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ESCALATION_LEVEL } from '@/constants/roles';
import { TokenPill } from './TokenPill';
import type { Ticket } from '@/types';

interface EscalationBadgeProps {
  level: Ticket['current_level'];
  className?: string;
}

/** Abbreviated because the badge shares a cell with the status pill: spelled
 *  out it is wider than the status it annotates. Its presence carries "this
 *  escalated"; its text only says how far, and the tooltip spells it out. */
export function EscalationBadge({ level, className }: EscalationBadgeProps) {
  if (!level || level === 'technician') return null;

  const words = ESCALATION_LEVEL[level];

  return (
    <TokenPill
      token="--status-escalated"
      className={cn('gap-0.5 px-1.5 text-[10px] font-semibold', className)}
      title={`Escalated to ${words?.full ?? level}`}
    >
      <ArrowUpRight className="h-2.5 w-2.5 shrink-0" />
      {words?.short ?? level}
    </TokenPill>
  );
}
