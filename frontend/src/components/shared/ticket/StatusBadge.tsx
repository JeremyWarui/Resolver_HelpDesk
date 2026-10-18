// The status pill. Every colour is a --status-* CSS token, defined in index.css.

import { STATUS_LABELS, STATUS_TOKEN } from '@/constants/tickets';
import { TokenPill } from './TokenPill';
import type { Ticket } from '@/types';

type TicketStatusValue = Ticket['status'];

export function StatusBadge({ status, className }: { status: TicketStatusValue; className?: string }) {
  return (
    <TokenPill token={STATUS_TOKEN[status] ?? '--status-closed'} className={className}>
      {STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}
    </TokenPill>
  );
}
