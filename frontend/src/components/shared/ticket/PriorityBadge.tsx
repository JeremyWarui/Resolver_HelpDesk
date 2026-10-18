// The priority pill. Every colour is a --priority-* CSS token from index.css,
// and priority itself is a server entity: {id, name, rank, …}.

import { TokenPill } from './TokenPill';
import type { Priority } from '@/types';

const PRIORITY_LABEL: Record<string, string> = {
  low:      'Low',
  medium:   'Medium',
  high:     'High',
  critical: 'Critical',
};

const PRIORITY_CSS_BASE: Record<string, string> = {
  low:      '--priority-low',
  medium:   '--priority-medium',
  high:     '--priority-high',
  critical: '--priority-critical',
};

interface PriorityBadgeProps {
  priority: Priority | string | undefined | null;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  if (!priority) return null;

  const name = typeof priority === 'string' ? priority : priority.name;
  const key = name.toLowerCase();

  return (
    <TokenPill token={PRIORITY_CSS_BASE[key] ?? '--priority-low'} className={className}>
      {PRIORITY_LABEL[key] ?? name}
    </TokenPill>
  );
}
