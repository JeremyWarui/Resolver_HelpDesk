import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock, PauseCircle,
  RefreshCcw, Star, Timer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPICardGrid, type KPIMetric } from '@/components/shared/data/KPICardGrid';
import { SLAComplianceGauge } from '@/components/shared/data/SLAComplianceGauge';
import { useTechnicianDashboard } from '@/hooks/dashboard';
import { useResolutionTimes } from '@/hooks/analytics';
import { formatSeconds } from '@/utils/date';
import type { AnalyticsParams } from '@/types';

/**
 * A technician's own report.
 *
 * Ordered by what can be acted on today, not by what is easiest to count. The
 * first row is work that needs attention now; throughput and quality follow.
 * The previous version led with "Total Assigned" and buried breaches three
 * cards along, which is the wrong way round for someone deciding what to do
 * next.
 *
 * No peer comparison anywhere. `role_config.py` sets `comparison: False` for
 * technicians and keeps `technician` out of their `allowed_group_by`, so the
 * backend will not serve a ranking — and this must not imply one exists.
 */
export function TechnicianPerformance({ params }: { params: AnalyticsParams }) {
  const { data, loading } = useTechnicianDashboard(params);
  const { data: times } = useResolutionTimes(params);

  const me = data?.individual ?? null;
  const section = data?.sectional ?? null;
  const aging = me?.aging_buckets;

  const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);
  // `csat` is Avg(rating) — a mean out of five, not a percentage. The previous
  // report rendered it with a % sign, so a solid 4-star average displayed as
  // "4.0%" and read as catastrophic.
  const rating = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toFixed(1)} / 5`;

  // ── Needs attention now ────────────────────────────────────────────────────
  const attention: KPIMetric[] = [
    {
      label: 'Breached',
      value: me?.breached ?? 0,
      description: 'Past the resolution deadline',
      icon: <AlertTriangle className="h-5 w-5" />,
      colorClass: 'text-destructive',
    },
    {
      label: 'At risk',
      value: me?.at_risk ?? 0,
      description: 'Deadline approaching',
      icon: <Clock className="h-5 w-5" />,
      colorClass: 'text-orange-600',
    },
    {
      label: 'Open load',
      value: me?.open_backlog ?? 0,
      description: 'Assigned to you now',
      icon: <ClipboardList className="h-5 w-5" />,
      colorClass: 'text-cyan-600',
    },
    {
      // Waiting on parts or access is not the same as running late, and the
      // SLA clock is frozen for these (R9). Shown separately so a blocked
      // queue does not read as a failing one.
      label: 'Paused',
      value: me?.currently_paused ?? 0,
      description: 'Blocked, clock stopped',
      icon: <PauseCircle className="h-5 w-5" />,
      colorClass: 'text-muted-foreground',
    },
  ];

  // ── Throughput ─────────────────────────────────────────────────────────────
  const throughput: KPIMetric[] = [
    {
      label: 'Resolved',
      value: me?.resolved ?? 0,
      description: 'In the selected window',
      trend: me?.delta?.resolved ?? undefined,
      icon: <CheckCircle2 className="h-5 w-5" />,
      colorClass: 'text-status-resolved',
    },
    {
      label: 'Resolution SLA',
      value: pct(me?.resolution_sla_pct),
      description: 'Closed within the deadline',
      trend: me?.delta?.resolution_sla_pct ?? undefined,
      icon: <Timer className="h-5 w-5" />,
      colorClass: 'text-primary',
    },
    {
      label: 'Response SLA',
      value: pct(me?.response_sla_pct),
      description: 'Picked up in time',
      trend: me?.delta?.response_sla_pct ?? undefined,
      icon: <Timer className="h-5 w-5" />,
      colorClass: 'text-primary',
    },
    {
      label: 'Typical resolution',
      value: formatSeconds(times?.resolution_time_p50_seconds ?? null),
      description: `Slowest 10%: ${formatSeconds(times?.resolution_time_p90_seconds ?? null)}`,
      icon: <Clock className="h-5 w-5" />,
      colorClass: 'text-muted-foreground',
    },
  ];

  // ── Did the work hold? ─────────────────────────────────────────────────────
  const quality: KPIMetric[] = [
    {
      label: 'Satisfaction',
      value: rating(me?.csat),
      description: 'Average requester rating',
      trend: me?.delta?.csat ?? undefined,
      icon: <Star className="h-5 w-5" />,
      colorClass: 'text-amber-500',
    },
    {
      // The signal that matters most in maintenance: a reopened ticket means
      // the fault came back, which no amount of speed makes up for.
      label: 'Reopen rate',
      value: pct(me?.reopen_rate),
      description: 'Work that came back',
      trend: me?.delta?.reopen_rate ?? undefined,
      icon: <RefreshCcw className="h-5 w-5" />,
      colorClass: 'text-destructive',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Needs attention</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Where your queue stands right now.
        </p>
        <KPICardGrid metrics={attention} loading={loading} columns={4} />
      </div>

      {aging && (
        <Card>
          <CardHeader className="pb-3 pt-5">
            <CardTitle className="text-base">How old is your open work?</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Under a day', value: aging.lt_1d, tone: 'text-status-resolved' },
                { label: '1–3 days', value: aging.d1_3d, tone: 'text-foreground' },
                { label: '3–7 days', value: aging.d3_7d, tone: 'text-orange-600' },
                { label: 'Over a week', value: aging.gt_7d, tone: 'text-destructive' },
              ].map((bucket) => (
                <div key={bucket.label} className="rounded-lg border p-3">
                  <p className={`text-2xl font-semibold ${bucket.tone}`}>{bucket.value ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{bucket.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">Throughput &amp; timeliness</h2>
        <KPICardGrid metrics={throughput} loading={loading} columns={4} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Did the work hold?</h2>
          <KPICardGrid metrics={quality} loading={loading} columns={2} />
        </div>
        <Card>
          <CardHeader className="pb-3 pt-5">
            <CardTitle className="text-base">SLA compliance</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <div className="flex items-center justify-around gap-4">
              <SLAComplianceGauge
                value={me?.resolution_sla_pct ?? 0}
                label="Resolution"
                loading={loading}
                size={110}
              />
              <SLAComplianceGauge
                value={me?.response_sla_pct ?? 0}
                label="Response"
                loading={loading}
                size={110}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section context, deliberately last and deliberately small: it explains
          the weather but a technician cannot act on it — that is the HOS's
          report. It used to occupy a whole tab of its own. */}
      {section && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your section, for context
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <span>
                <span className="text-muted-foreground">Section backlog: </span>
                <span className="font-medium">{section.open_backlog}</span>
              </span>
              <span>
                <span className="text-muted-foreground">Resolved: </span>
                <span className="font-medium">{section.resolved}</span>
              </span>
              <span>
                <span className="text-muted-foreground">Unassigned: </span>
                <span className="font-medium">{section.unassigned ?? 0}</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TechnicianPerformance;
