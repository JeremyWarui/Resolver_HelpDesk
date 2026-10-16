import { Hourglass, ShieldCheck, Star, Timer } from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import MetricCard from '@/components/shared/data/MetricCard';
import { formatSeconds } from '@/utils/date';
import type { AnalyticsParams } from '@/types';

interface Props {
  params?: AnalyticsParams;
}

/** How fast and how well: average response and resolution time, both SLA
 *  percentages, and the rating, for the caller's scope.
 *
 *  No Overdue card: `TicketStatsCards` renders one directly above this row on
 *  the reports page, off the same `totals.overdue`. The same figure twice on
 *  one screen reads as two measurements that happen to agree. */
export default function ServiceHealthCards({ params }: Props) {
  const { data } = useAnalytics(params);
  const totals = data?.totals;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 text-foreground">Service Health</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard
          title="Avg Response"
          value={formatSeconds(totals?.response_seconds_avg ?? null)}
          description="Raised to first assigned"
          icon={<Timer className="h-6 w-6 text-blue-600" />}
          iconBgColor="bg-blue-100"
          className="bg-card"
        />
        <MetricCard
          title="Avg Resolution"
          value={formatSeconds(totals?.resolution_seconds_avg ?? null)}
          description="Raised to resolved, holds excluded"
          icon={<Hourglass className="h-6 w-6 text-status-resolved" />}
          iconBgColor="bg-status-resolved/10"
          className="bg-card"
        />
        <MetricCard
          title="Resolution SLA"
          value={totals?.resolution_sla_pct != null ? `${totals.resolution_sla_pct.toFixed(1)}%` : '—'}
          description="Settled within target"
          icon={<ShieldCheck className="h-6 w-6 text-status-resolved" />}
          iconBgColor="bg-status-resolved/10"
          className="bg-card"
        />
        <MetricCard
          title="Response SLA"
          value={totals?.response_sla_pct != null ? `${totals.response_sla_pct.toFixed(1)}%` : '—'}
          description="Assigned within target"
          icon={<ShieldCheck className="h-6 w-6 text-blue-600" />}
          iconBgColor="bg-blue-100"
          className="bg-card"
        />
        <MetricCard
          title="Rating"
          value={totals?.rating_avg != null ? `${totals.rating_avg.toFixed(1)} / 5` : '—'}
          description={`${totals?.rating_count ?? 0} rated`}
          icon={<Star className="h-6 w-6 text-purple-600" />}
          iconBgColor="bg-purple-100"
          className="bg-card"
        />
      </div>
    </div>
  );
}
