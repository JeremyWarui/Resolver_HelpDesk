import { cn } from '@/lib/utils';
import type { AnalyticsParams } from '@/types';

const PRESETS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

// Legacy simple props (days-only) — kept for back-compat
export interface DateRangeSelectorProps {
  value: AnalyticsParams;
  onChange: (params: AnalyticsParams) => void;
  className?: string;
}

export function DateRangeSelector({ value, onChange, className }: DateRangeSelectorProps) {
  const activeDays = value.days ?? 30;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {PRESETS.map((p) => (
        <button
          key={p.days}
          type="button"
          onClick={() => onChange({ days: p.days })}
          className={cn(
            'text-xs px-2.5 py-1 rounded-md font-medium transition-colors',
            activeDays === p.days && !value.date_from
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
