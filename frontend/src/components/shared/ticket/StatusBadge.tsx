/* eslint-disable react-refresh/only-export-components */
// The status pill, and the badge-colour helper the stat cards share with it.
// Every colour is a --status-* CSS token, defined in index.css.

import { STATUS_LABELS, STATUS_TOKEN } from '@/constants/tickets';
import { TokenPill } from './TokenPill';
import type { Ticket } from '@/types';

type TicketStatusValue = Ticket['status'];

// Colour name → [background, text] CSS variables, for a badge that carries a
// named colour, not a ticket status.
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

export function StatusBadge({ status, className }: { status: TicketStatusValue; className?: string }) {
  return (
    <TokenPill token={STATUS_TOKEN[status] ?? '--status-closed'} className={className}>
      {STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}
    </TokenPill>
  );
}
