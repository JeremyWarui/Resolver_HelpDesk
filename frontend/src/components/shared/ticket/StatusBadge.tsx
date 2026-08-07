/* eslint-disable react-refresh/only-export-components */
// StatusBadge — canonical status badge for all ticket displays.
// Replaces getStatusBadgeVariant (TicketDetailsUtils.tsx) which used hardcoded
// Tailwind classes. This component drives every status colour through the
// --status-* CSS tokens defined in index.css via color-mix().
//
// Migration: replace Badge + getStatusBadgeVariant with <StatusBadge status={...} />
// For table cells that can't use JSX directly, import getStatusStyle() instead.

import { cn } from '@/lib/utils';
import { STATUS_LABELS } from '@/constants/tickets';
import type { Ticket } from '@/types';

export type TicketStatusValue = Ticket['status'];

// Maps each status to its CSS variable base name (without suffix).
// The -bg / -text / -border triplets are defined in index.css.
const STATUS_CSS_BASE: Record<TicketStatusValue, string> = {
  open:        '--status-open',
  assigned:    '--status-assigned',
  in_progress: '--status-progress',
  pending:     '--status-pending',
  resolved:    '--status-resolved',
  closed:      '--status-closed',
};

export function getStatusStyle(status: string): React.CSSProperties {
  const base = STATUS_CSS_BASE[status as TicketStatusValue] ?? '--status-closed';
  return {
    backgroundColor: `var(${base}-bg)`,
    color:           `var(${base}-text)`,
    borderColor:     `var(${base}-border)`,
  };
}

// Semantic color name → CSS variable token mapping for stat card badges.
// Use this anywhere a badge carries a named color (blue/green/red/etc.)
// rather than a ticket status string.
// Maps color names to [background, text] CSS variable pairs.
const BADGE_COLOR_TOKEN: Record<string, [string, string]> = {
  blue:   ['--status-open-bg',      '--status-open-text'],
  green:  ['--status-resolved-bg',  '--status-resolved-text'],
  orange: ['--status-progress-bg',  '--status-progress-text'],
  red:    ['--status-escalated-bg', '--status-escalated-text'],
  purple: ['--status-pending-bg',   '--status-pending-text'],
  gray:   ['--status-closed-bg',    '--status-closed-text'],
  amber:  ['--status-approval-bg',  '--status-approval-text'],
};

export function getBadgeStyle(color: string): React.CSSProperties {
  const [bg, text] = BADGE_COLOR_TOKEN[color] ?? BADGE_COLOR_TOKEN.gray;
  return { backgroundColor: `var(${bg})`, color: `var(${text})` };
}

interface StatusBadgeProps {
  status: TicketStatusValue;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border whitespace-nowrap',
        className,
      )}
      style={getStatusStyle(status)}
    >
      {STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}
    </span>
  );
}
