// The row of filter pills above a ticket table. It carries the choice; the
// table beside it carries the rows.

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { FilterPill } from '@/types';

interface FilterPillsProps {
  pills: FilterPill[];
  active: string;
  onChange: (key: string) => void;
  loading?: boolean;
  className?: string;
}

// Maps each variant to its CSS variable base name (without -bg/-text/-border suffix).
// 'default' is handled separately below (uses --primary with color-mix).
const VARIANT_CSS_BASE: Record<NonNullable<FilterPill['variant']>, string | null> = {
  default:     null,
  danger:      '--status-escalated',
  warning:     '--status-progress',
  success:     '--status-resolved',
  open:        '--status-open',
  assigned:    '--status-assigned',
  in_progress: '--status-progress',
  pending:     '--status-pending',
  resolved:    '--status-resolved',
  closed:      '--status-closed',
};

export function FilterPills({ pills, active, onChange, loading = false, className }: FilterPillsProps) {
  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 flex-wrap', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {pills.map((pill) => {
        const isActive = active === pill.key;
        const variant = pill.variant ?? 'default';
        const cssBase = VARIANT_CSS_BASE[variant];

        // A status pill is always tinted, so the row reads as a legend even
        // before anything is picked; being active only adds the border.
        // The plain 'All' pill has no status colour, so it is a neutral ghost
        // until picked and takes a primary tint when it is.
        const pillStyle: React.CSSProperties | undefined = cssBase ? {
          backgroundColor: `var(${cssBase}-bg)`,
          color:           `var(${cssBase}-text)`,
          borderColor:     isActive ? `var(${cssBase}-text)` : 'transparent',
        } : isActive ? {
          backgroundColor: `color-mix(in oklch, var(--primary) 14%, white)`,
          color:           `color-mix(in oklch, var(--primary) 60%, oklch(0.15 0 0))`,
          borderColor:     `color-mix(in oklch, var(--primary) 60%, oklch(0.15 0 0))`,
        } : undefined;

        return (
          <Button
            key={pill.key}
            variant={cssBase ? 'outline' : isActive ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => onChange(pill.key)}
            className={cn(
              'rounded-full gap-1.5 transition-all h-8 px-3 text-sm font-medium',
              !cssBase && !isActive && 'text-muted-foreground hover:text-foreground',
              isActive && 'font-semibold border-2',
            )}
            style={pillStyle}
          >
            {pill.label}
          </Button>
        );
      })}
    </div>
  );
}
