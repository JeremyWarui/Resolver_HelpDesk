// The priority pill. Every colour is a --priority-* CSS token from index.css,
// and priority itself is a server entity: {id, name, rank, …}.

import { TokenPill } from './TokenPill';
import type { Priority } from '@/types';

const PRIORITY_TOKEN: Record<string, string> = {
  low:      '--priority-low',
  medium:   '--priority-medium',
  high:     '--priority-high',
  critical: '--priority-critical',
};

interface PriorityBadgeProps {
  priority: Priority | undefined | null;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  if (!priority) return null;
  return (
    <TokenPill token={PRIORITY_TOKEN[priority.name.toLowerCase()] ?? '--priority-low'} className={className}>
      {priority.name}
    </TokenPill>
  );
}
