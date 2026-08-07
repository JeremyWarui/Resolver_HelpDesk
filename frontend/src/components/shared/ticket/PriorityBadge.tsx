/* eslint-disable react-refresh/only-export-components */
// PriorityBadge — drives every priority colour through the
// --priority-* CSS tokens defined in index.css.
// Priority is now a server entity object {id, name, rank, ...}.

import { cn } from '@/lib/utils';
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

export function getPriorityStyle(priorityName: string): React.CSSProperties {
  const base = PRIORITY_CSS_BASE[priorityName.toLowerCase()] ?? '--priority-low';
  return {
    backgroundColor: `var(${base}-bg)`,
    color:           `var(${base}-text)`,
    borderColor:     `var(${base}-border)`,
  };
}

interface PriorityBadgeProps {
  priority: Priority | string | undefined | null;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  if (!priority) return null;

  const name = typeof priority === 'string' ? priority : priority.name;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border whitespace-nowrap',
        className,
      )}
      style={getPriorityStyle(name)}
    >
      {PRIORITY_LABEL[name.toLowerCase()] ?? name}
    </span>
  );
}
