// KPICardGrid — responsive grid of KPI stat cards with trend indicators.
// Wraps StatCard with a typed KPIMetric interface and a standard grid layout.

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface KPIMetric {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number;        // positive = up, negative = down, 0 = flat (% change)
  description?: string;
  colorClass?: string;   // e.g. 'text-blue-600' for the icon background
}

interface KPICardGridProps {
  metrics: KPIMetric[];
  loading?: boolean;
  columns?: 2 | 3 | 4;
  className?: string;
}

function TrendIndicator({ trend }: { trend: number }) {
  if (trend > 0)  return <div className="flex items-center gap-0.5 text-xs text-green-600"><TrendingUp className="h-3 w-3" />+{trend}%</div>;
  if (trend < 0)  return <div className="flex items-center gap-0.5 text-xs text-red-600"><TrendingDown className="h-3 w-3" />{trend}%</div>;
  return <div className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0%</div>;
}

function KPICard({ metric }: { metric: KPIMetric }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground truncate">{metric.label}</p>
            <p className="text-2xl font-bold mt-0.5">{metric.value}</p>
            {metric.description && (
              <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
            )}
            {metric.trend !== undefined && (
              <div className="mt-1.5">
                <TrendIndicator trend={metric.trend} />
              </div>
            )}
          </div>
          {metric.icon && (
            <div className={cn('p-2.5 rounded-lg bg-muted shrink-0', metric.colorClass)}>
              {metric.icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const GRID_COLS: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
};

export function KPICardGrid({ metrics, loading = false, columns = 4, className }: KPICardGridProps) {
  if (loading) {
    return (
      <div className={cn('grid gap-4', GRID_COLS[columns], className)}>
        {Array.from({ length: columns }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid gap-4', GRID_COLS[columns], className)}>
      {metrics.map((m, i) => <KPICard key={i} metric={m} />)}
    </div>
  );
}
