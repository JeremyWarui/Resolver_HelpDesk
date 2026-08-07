import { AlertTriangle, Lightbulb } from 'lucide-react';
import ChartCard from '@/components/shared/data/ChartCard';
import type { Insight } from '@/types';

const SEVERITY_STYLES: Record<string, string> = {
  high: 'border-l-red-500 bg-red-50',
  med: 'border-l-amber-500 bg-amber-50',
  low: 'border-l-gray-400 bg-gray-50',
};

/**
 * Actionable insights list (recurring faults, bottlenecks, SLA leaks, …) from the
 * unified /analytics/ envelope. Shared across analytics + role dashboards.
 */
export default function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <ChartCard title="Insights" description="What needs attention — and what to fix">
      <div className="space-y-2">
        {insights.map((i, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 border-l-4 rounded-md p-3 ${SEVERITY_STYLES[i.severity] ?? SEVERITY_STYLES.low}`}
          >
            {i.severity === 'high' ? (
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            ) : (
              <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            )}
            <p className="text-sm text-foreground">{i.message}</p>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
