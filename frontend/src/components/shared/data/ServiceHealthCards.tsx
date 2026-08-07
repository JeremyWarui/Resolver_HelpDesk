import { ShieldCheck, Star, AlertTriangle } from 'lucide-react';
import { useSLACompliance, useQuality } from '@/hooks/analytics';
import MetricCard from '@/components/shared/data/MetricCard';
import type { AnalyticsParams } from '@/types';

interface Props {
  params?: AnalyticsParams;
  /** Show the "Service Health" heading above the cards (default true). */
  heading?: boolean;
}

/**
 * Service-health KPI row — Resolution SLA, Response SLA, CSAT, Breached.
 * Self-fetching (scoped server-side by JWT). Reused by the Reports landing and
 * the role dashboards.
 */
export default function ServiceHealthCards({ params, heading = true }: Props) {
  const { data: sla } = useSLACompliance(params);
  const { data: quality } = useQuality(params);

  return (
    <div>
      {heading && <h2 className="text-lg font-semibold mb-4 text-foreground">Service Health</h2>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Resolution SLA %"
          value={sla?.resolution_sla_pct != null ? `${sla.resolution_sla_pct.toFixed(1)}%` : '—'}
          description="SLA compliance for resolution"
          icon={<ShieldCheck className="h-6 w-6 text-status-resolved" />}
          iconBgColor="bg-status-resolved/10"
          className="bg-card"
        />
        <MetricCard
          title="Response SLA %"
          value={sla?.response_sla_pct != null ? `${sla.response_sla_pct.toFixed(1)}%` : '—'}
          description="SLA compliance for first response"
          icon={<ShieldCheck className="h-6 w-6 text-blue-600" />}
          iconBgColor="bg-blue-100"
          className="bg-card"
        />
        <MetricCard
          title="CSAT"
          value={quality?.csat != null ? `${quality.csat.toFixed(1)}%` : '—'}
          description="Customer satisfaction score"
          icon={<Star className="h-6 w-6 text-purple-600" />}
          iconBgColor="bg-purple-100"
          className="bg-card"
        />
        <MetricCard
          title="Breached"
          value={sla?.breached ?? 0}
          description="SLA breached tickets"
          icon={<AlertTriangle className="h-6 w-6 text-status-escalated" />}
          iconBgColor="bg-status-escalated/10"
          className="bg-card"
        />
      </div>
    </div>
  );
}
