/**
 * EscalationBadge — "this job is no longer only the technician's problem".
 *
 * Escalation was visible in exactly one place: the Escalated page, which only
 * the HOS and HOD have. That meant the person whose ticket escalated — the
 * technician holding it — had no way to find out, and even a HOS looking at
 * their ordinary Tickets list saw an escalated job rendered identically to
 * every other one. `current_level` was serialised, typed, and filterable, and
 * never once rendered in a list.
 *
 * So the marker lives beside the status rather than in a column of its own:
 * `status` is the one column no variant hides, and escalation *is* a fact
 * about where a ticket sits, which is what the status column is for. A column
 * would have needed adding to six visibility maps and would render an em dash
 * in every cell of the 90% of tickets that never escalate.
 *
 * Renders nothing at `technician` — the un-escalated default is the absence of
 * a badge, not a badge saying "normal".
 */
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

/** Who the ticket has climbed to. Keys match `Ticket.current_level`.
 *
 *  Abbreviated on purpose: the badge sits inside a status cell beside a status
 *  pill, and "Head of department" spelled out was wider than the status it was
 *  annotating — it read as the row's headline rather than a marker on it. The
 *  badge's presence carries "this escalated"; its text only says how far.
 *
 *  There was a red row tint too, and it is gone from the Tickets lists: on a
 *  busy page it repainted every escalated row and drowned out the SLA
 *  colours those lists are actually read for. The Escalated page keeps its
 *  own tint, keyed on `is_breaching`. */
const LEVEL_LABEL: Record<string, string> = {
  hos: 'HOS',
  hod: 'HOD',
};

/** Full form, for the `title` tooltip — "HOD" alone is not self-explaining. */
const LEVEL_TITLE: Record<string, string> = {
  hos: 'the head of section',
  hod: 'the head of department',
};

interface EscalationBadgeProps {
  level: Ticket['current_level'];
  className?: string;
}

export function EscalationBadge({ level, className }: EscalationBadgeProps) {
  if (!level || level === 'technician') return null;

  const label = LEVEL_LABEL[level] ?? level;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5',
        'text-[10px] font-semibold whitespace-nowrap',
        className,
      )}
      style={{
        backgroundColor: 'var(--status-escalated-bg)',
        color: 'var(--status-escalated-text)',
        borderColor: 'var(--status-escalated-border)',
      }}
      title={`Escalated to ${LEVEL_TITLE[level] ?? label}`}
    >
      <ArrowUpRight className="h-2.5 w-2.5 shrink-0" />
      {label}
    </span>
  );
}
