import { ShieldCheck, Star, AlertTriangle } from 'lucide-react';
import { useAnalytics } from '@/hooks/analytics';
import MetricCard from '@/components/shared/data/MetricCard';
import type { AnalyticsParams } from '@/types';

interface Props {
  params?: AnalyticsParams;
  /** Show the "Service Health" heading above the cards (default true). */
  heading?: boolean;
}

/**
 * Service-health KPI row — Resolution SLA, Response SLA, CSAT, Overdue.
 * Self-fetching (scoped server-side by JWT). Reused by the Reports landing and
 * the role dashboards.
 *
 * Never rendered for a technician: the Reports landing puts this whole block
 * behind `!isTechnician` (their overview is MyPerformancePanel), and no
 * technician reaches RoleDashboardView. That matters because the unified
 * envelope answers a technician with `individual`/`sectional` instead of
 * `headline` — which is why reading `headline` here is safe.
 */
export default function ServiceHealthCards({ params, heading = true }: Props) {
  // These four were two endpoints, each re-running the whole ~40-query
  // aggregate() to slice out two scalars the envelope already carries.
  const { data: envelope } = useAnalytics(params);
  const headline = envelope?.headline ?? null;

  return (
    <div>
      {heading && <h2 className="text-lg font-semibold mb-4 text-foreground">Service Health</h2>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Resolution SLA %"
          value={headline?.resolution_sla_pct != null ? `${headline.resolution_sla_pct.toFixed(1)}%` : '—'}
          description="SLA compliance for resolution"
          icon={<ShieldCheck className="h-6 w-6 text-status-resolved" />}
          iconBgColor="bg-status-resolved/10"
          className="bg-card"
        />
        <MetricCard
          title="Response SLA %"
          value={headline?.response_sla_pct != null ? `${headline.response_sla_pct.toFixed(1)}%` : '—'}
          description="SLA compliance for first response"
          icon={<ShieldCheck className="h-6 w-6 text-blue-600" />}
          iconBgColor="bg-blue-100"
          className="bg-card"
        />
        <MetricCard
          title="CSAT"
          value={headline?.csat != null ? `${headline.csat.toFixed(1)} / 5` : '—'}
          description="Customer satisfaction score"
          icon={<Star className="h-6 w-6 text-purple-600" />}
          iconBgColor="bg-purple-100"
          className="bg-card"
        />
        <MetricCard
          title="Overdue"
          value={headline?.breached ?? 0}
          description="Live and past target"
          icon={<AlertTriangle className="h-6 w-6 text-status-escalated" />}
          iconBgColor="bg-status-escalated/10"
          className="bg-card"
        />
      </div>
    </div>
  );
}
