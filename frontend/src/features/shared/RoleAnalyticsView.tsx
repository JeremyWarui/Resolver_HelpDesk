import { useState, type ComponentType } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  AdminStatsCards,
  ManagerStatsCards,
  HODStatsCards,
  SectionHeadStatsCards,
} from '@/components/shared/data/StatCards';
import { DateRangeSelector } from '@/components/shared/data/DateRangeSelector';
import { FlowTrendChart } from '@/components/shared/data/TicketVolumeChart';
import { TechnicianBreakdownTable } from '@/components/shared/data/TechnicianPerformanceTable';
import { KPICardGrid, type KPIMetric } from '@/components/shared/data/KPICardGrid';
import { AppPieChart } from '@/components/shared/data/AppPieChart';
import ChartCard from '@/components/shared/data/ChartCard';
import InsightsPanel from '@/components/shared/data/InsightsPanel';
import LazyMount from '@/components/shared/LazyMount';
import {
  useSLACompliance,
  useResolutionTimes,
  useFlow,
  useQuality,
  usePerformanceTechnicians,
  usePerformanceSections,
  usePerformanceCampusDepts,
  useAnalytics,
} from '@/hooks/analytics';
import { Clock, Star, RefreshCw, Activity, ShieldCheck, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import type { AnalyticsParams } from '@/types';
import { GranularitySelector, type Granularity } from '@/components/shared/GranularitySelector';

export type AnalyticsRole = 'admin' | 'manager' | 'hod' | 'hos';

interface RoleAnalyticsViewProps {
  role: AnalyticsRole;
}

interface RoleAnalyticsConfig {
  StatCards: ComponentType;
  title: string;
  subtitle: string;
}

// Role-specific surface = StatCards + title/subtitle only.
// Every analytics endpoint scopes server-side by JWT, so the deep
// charts/tables/KPIs are identical across roles.
const ROLE_CONFIG: Record<AnalyticsRole, RoleAnalyticsConfig> = {
  admin: {
    StatCards: AdminStatsCards,
    title: 'Organisation Analytics',
    subtitle: 'System-wide ticket metrics across all campuses',
  },
  manager: {
    StatCards: ManagerStatsCards,
    title: 'Department Analytics',
    subtitle: 'Your department across all campuses',
  },
  hod: {
    StatCards: HODStatsCards,
    title: 'Campus Department Analytics',
    subtitle: 'Sections within your campus department',
  },
  hos: {
    StatCards: SectionHeadStatsCards,
    title: 'Section Analytics',
    subtitle: 'Your section(s) and technicians',
  },
};

function formatSeconds(s: number | null): string {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}

export function RoleAnalyticsView({ role }: RoleAnalyticsViewProps) {
  const { StatCards, subtitle } = ROLE_CONFIG[role];

  const [params, setParams] = useState<AnalyticsParams>({ days: 30 });
  const [granularity, setGranularity] = useState<Granularity>('day');

  const { data: sla, loading: slaLoading } = useSLACompliance(params);
  const { data: resTimes, loading: resLoading } = useResolutionTimes(params);
  const { data: flow, loading: flowLoading } = useFlow({ ...params, granularity });
  const { data: quality } = useQuality(params);
  const { data: perfTechs, loading: perfTechsLoading } = usePerformanceTechnicians(params);
  const { data: perfSections, loading: perfSectionsLoading } = usePerformanceSections(params);

  // Manager analytics adds a per-campus performance table (department grouped by
  // campus). Skipped for other roles. Server-scoped by JWT.
  const isManager = role === 'manager';
  const { data: perfCampus, loading: perfCampusLoading } = usePerformanceCampusDepts(
    params,
    { enabled: isManager },
  );

  // Unified envelope for the actionable insights panel. Insights are computed
  // server-side over the caller's scope; group_by only shapes the breakdown
  // (campus for managers, section otherwise).
  const { data: analyticsEnvelope } = useAnalytics({
    ...params,
    group_by: isManager ? 'campus_department' : 'section',
  });

  const resolutionKPIs: KPIMetric[] = [
    {
      label: 'Resolution p50',
      value: formatSeconds(resTimes?.resolution_time_p50_seconds ?? null),
      icon: <Clock className="h-4 w-4" />,
      colorClass: 'bg-primary/10 text-primary',
      description: 'Median resolution time',
    },
    {
      label: 'Resolution p90',
      value: formatSeconds(resTimes?.resolution_time_p90_seconds ?? null),
      icon: <Clock className="h-4 w-4" />,
      colorClass: 'bg-status-progress/10 text-status-progress',
      description: '90th percentile — 1 in 10 takes longer',
    },
    {
      label: 'Response p50',
      value: formatSeconds(resTimes?.first_response_p50_seconds ?? null),
      icon: <Activity className="h-4 w-4" />,
      colorClass: 'bg-primary/10 text-primary',
      description: 'Median first response time',
    },
    {
      label: 'Response p90',
      value: formatSeconds(resTimes?.first_response_p90_seconds ?? null),
      icon: <Activity className="h-4 w-4" />,
      colorClass: 'bg-status-progress/10 text-status-progress',
      description: '90th percentile first response',
    },
  ];

  const statusData = (flow?.status_distribution ?? []).map(s => ({
    name: s.status.replace(/_/g, ' '),
    value: s.count,
  }));

  const priorityData = (flow?.priority_distribution ?? []).map(p => ({
    name: p.name,
    value: p.count,
  }));

  // HOD section-distribution donut — reuses the perfSections breakdown (no new hook).
  const sectionDistData = (perfSections?.breakdown ?? []).map(s => ({
    name: s.section_type_name,
    value: s.total,
  }));

  const headlineKPIs: KPIMetric[] = [
    {
      label: 'Resolution SLA',
      value: sla?.resolution_sla_pct != null ? `${sla.resolution_sla_pct.toFixed(1)}%` : '—',
      icon: <ShieldCheck className="h-4 w-4" />,
      colorClass: (sla?.resolution_sla_pct ?? 0) >= 95
        ? 'bg-status-resolved/10 text-status-resolved'
        : 'bg-status-escalated/10 text-status-escalated',
      trend: sla?.delta.resolution_sla_pct ?? undefined,
      description: `${sla?.at_risk ?? 0} at-risk · ${sla?.breached ?? 0} breached`,
    },
    {
      label: 'Response SLA',
      value: sla?.response_sla_pct != null ? `${sla.response_sla_pct.toFixed(1)}%` : '—',
      icon: <ShieldCheck className="h-4 w-4" />,
      colorClass: (sla?.response_sla_pct ?? 0) >= 95
        ? 'bg-status-resolved/10 text-status-resolved'
        : 'bg-status-escalated/10 text-status-escalated',
      trend: sla?.delta.response_sla_pct ?? undefined,
    },
    {
      label: 'Net Flow / Backlog',
      value: flow
        ? `${flow.net_flow >= 0 ? '+' : ''}${flow.net_flow} / ${flow.open_backlog}`
        : '—',
      icon: <TrendingUp className="h-4 w-4" />,
      colorClass: 'bg-primary/10 text-primary',
      trend: flow?.delta.created ?? undefined,
      description: flow ? `${flow.created} created · ${flow.resolved} resolved` : undefined,
    },
    {
      label: 'CSAT',
      value: quality?.csat != null ? `${quality.csat.toFixed(1)}%` : '—',
      icon: <Star className="h-4 w-4" />,
      colorClass: 'bg-purple-500/10 text-purple-500',
      trend: quality?.delta.csat ?? undefined,
    },
    {
      label: 'Reopen Rate',
      value: quality?.reopen_rate != null ? `${quality.reopen_rate.toFixed(1)}%` : '—',
      icon: <RefreshCw className="h-4 w-4" />,
      colorClass: (quality?.reopen_rate ?? 0) > 5
        ? 'bg-status-escalated/10 text-status-escalated'
        : 'bg-muted text-muted-foreground',
      trend: quality?.delta.reopen_rate != null ? -(quality.delta.reopen_rate) : undefined,
      description: 'lower is better',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <GranularitySelector value={granularity} onChange={setGranularity} />
          <DateRangeSelector value={params} onChange={setParams} />
        </div>
      </div>

      {/* Summary Cards — live ticket status counts (scoped by role) */}
      <StatCards />

      {/* Row 2 — over-time chart (single total series for all roles) + distribution pies */}
      {role === 'hod' || role === 'hos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FlowTrendChart
            flow={flow}
            loading={flowLoading}
            totalOnly
            height={400}
            title={`Ticket Flow — Last ${params.days ?? 30} Days`}
            granularity={granularity}
          />
          {role === 'hod' ? (
            <ChartCard title="Section Distribution" description="Tickets by section">
              {perfSectionsLoading || !perfSections ? (
                <Skeleton className="h-[400px] w-full" />
              ) : sectionDistData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data</p>
              ) : (
                <AppPieChart data={sectionDistData} height={400} innerRadius={95} outerRadius={155} />
              )}
            </ChartCard>
          ) : (
            <ChartCard title="Status Distribution" description="Tickets by current status">
              {flowLoading ? (
                <Skeleton className="h-[400px] w-full" />
              ) : statusData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data</p>
              ) : (
                <AppPieChart data={statusData} height={400} innerRadius={95} outerRadius={155} />
              )}
            </ChartCard>
          )}
        </div>
      ) : (
        <>
          {/* Flow Trend Chart */}
          <FlowTrendChart
            flow={flow}
            loading={flowLoading}
            totalOnly
            height={400}
            title={`Ticket Flow — Last ${params.days ?? 30} Days`}
            granularity={granularity}
          />

          {/* Status + Priority distribution */}
          <LazyMount minHeight={420}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Status Distribution" description="Tickets by current status">
                {flowLoading ? (
                  <Skeleton className="h-[360px] w-full" />
                ) : statusData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  <AppPieChart data={statusData} height={360} innerRadius={85} outerRadius={140} />
                )}
              </ChartCard>
              <ChartCard title="Priority Distribution" description="Tickets by priority level">
                {flowLoading ? (
                  <Skeleton className="h-[360px] w-full" />
                ) : priorityData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  <AppPieChart data={priorityData} height={360} innerRadius={85} outerRadius={140} />
                )}
              </ChartCard>
            </div>
          </LazyMount>
        </>
      )}

      {/* Technician Performance Table */}
      <LazyMount minHeight={420}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-base">Technician Performance</CardTitle>
            <CardDescription>Performance metrics for all technicians</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <TechnicianBreakdownTable
              data={perfTechs}
              loading={perfTechsLoading}
              bare={true}
            />
          </CardContent>
        </Card>
      </LazyMount>

      {/* Section Performance — hidden for HOS (single section) */}
      {role !== 'hos' && (
      <LazyMount minHeight={420}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-base">Section Performance</CardTitle>
            <CardDescription>Ticket load and SLA per section</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            {perfSectionsLoading || !perfSections ? (
              <SectionSkeleton />
            ) : perfSections.breakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No section data</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm bg-card">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-3 py-3 font-medium">Section</th>
                      <th className="px-3 py-3 font-medium">Campus</th>
                      <th className="px-3 py-3 font-medium text-right">Total</th>
                      <th className="px-3 py-3 font-medium text-right">Open</th>
                      <th className="px-3 py-3 font-medium text-right">Resolved</th>
                      <th className="px-3 py-3 font-medium text-right">Escalated</th>
                      <th className="px-3 py-3 font-medium text-right">SLA %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {perfSections.breakdown.map((s) => {
                      const slaPct = s.total_resolved_with_due > 0
                        ? Math.round((s.resolution_sla_met / s.total_resolved_with_due) * 100)
                        : null;
                      return (
                        <tr key={s.section_id}>
                          <td className="px-3 py-2.5 font-medium">{s.section_type_name}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            <span>{s.campus_name}</span>
                            <Badge variant="outline" className="ml-2 text-xs">{s.campus_code}</Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right">{s.total}</td>
                          <td className="px-3 py-2.5 text-right text-status-open">{s.open_count}</td>
                          <td className="px-3 py-2.5 text-right text-status-resolved">{s.resolved_count}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={s.escalated_count > 0 ? 'text-status-escalated' : 'text-muted-foreground'}>
                              {s.escalated_count}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {slaPct != null ? (
                              <span className={slaPct >= 90 ? 'text-status-resolved' : slaPct >= 75 ? 'text-status-progress' : 'text-status-escalated'}>
                                {slaPct}%
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </LazyMount>
      )}

      {/* Campus Performance (manager only) — ticket load per campus */}
      {isManager && (
        <LazyMount minHeight={420}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-base">Campus Performance</CardTitle>
            <CardDescription>Ticket load and SLA per campus across your department</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            {perfCampusLoading || !perfCampus ? (
              <SectionSkeleton />
            ) : perfCampus.breakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campus data</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm bg-card">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-3 py-3 font-medium">Campus</th>
                      <th className="px-3 py-3 font-medium text-right">Total</th>
                      <th className="px-3 py-3 font-medium text-right">Open</th>
                      <th className="px-3 py-3 font-medium text-right">Resolved</th>
                      <th className="px-3 py-3 font-medium text-right">Escalated</th>
                      <th className="px-3 py-3 font-medium text-right">SLA %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {perfCampus.breakdown.map((c) => {
                      const slaPct = c.total_resolved_with_due > 0
                        ? Math.round((c.resolution_sla_met / c.total_resolved_with_due) * 100)
                        : null;
                      return (
                        <tr key={c.cd_id}>
                          <td className="px-3 py-2.5 font-medium">{c.campus_name}</td>
                          <td className="px-3 py-2.5 text-right">{c.total}</td>
                          <td className="px-3 py-2.5 text-right text-status-open">{c.open_count}</td>
                          <td className="px-3 py-2.5 text-right text-status-resolved">{c.resolved_count}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={c.escalated_count > 0 ? 'text-status-escalated' : 'text-muted-foreground'}>
                              {c.escalated_count}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {slaPct != null ? (
                              <span className={slaPct >= 90 ? 'text-status-resolved' : slaPct >= 75 ? 'text-status-progress' : 'text-status-escalated'}>
                                {slaPct}%
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </LazyMount>
      )}

      {/* Health Overview KPIs — Resolution SLA, Response SLA, Net Flow, CSAT, Reopen Rate */}
      <LazyMount minHeight={220}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-base">Health Overview</CardTitle>
            <CardDescription>Service-desk health across your whole department</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <div className="grid grid-cols-5 gap-2">
              {headlineKPIs.map((metric) => (
                <div
                  key={metric.label}
                  className="bg-card rounded-lg border p-3 flex items-start justify-between"
                >
                  <div className="space-y-1 flex-1">
                    <p className="text-xs text-muted-foreground font-medium">{metric.label}</p>
                    <p className="text-lg font-semibold text-foreground">{metric.value}</p>
                    {metric.description && (
                      <p className="text-xs text-muted-foreground">{metric.description}</p>
                    )}
                  </div>
                  <div className={`p-1.5 rounded ml-2 flex-shrink-0 ${metric.colorClass}`}>
                    {metric.icon}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </LazyMount>

      {/* SLA Compliance — Compact Grid */}
      <LazyMount minHeight={260}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-base">SLA Compliance</CardTitle>
            <CardDescription>Response and resolution SLA performance vs. 95% target</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
          <div className="grid grid-cols-4 gap-3">
            {/* Resolution SLA */}
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="space-y-1 flex-1">
                  <p className="text-xs text-muted-foreground font-medium">Resolution SLA</p>
                  <p className="text-2xl font-bold text-foreground">
                    {slaLoading ? '—' : `${(sla?.resolution_sla_pct ?? 0).toFixed(1)}%`}
                  </p>
                </div>
                <div className={`p-2 rounded ${
                  (sla?.resolution_sla_pct ?? 0) >= 95
                    ? 'bg-status-resolved/10'
                    : (sla?.resolution_sla_pct ?? 0) >= 90
                      ? 'bg-status-progress/10'
                      : 'bg-status-escalated/10'
                }`}>
                  <CheckCircle className={`h-5 w-5 ${
                    (sla?.resolution_sla_pct ?? 0) >= 95
                      ? 'text-status-resolved'
                      : (sla?.resolution_sla_pct ?? 0) >= 90
                        ? 'text-status-progress'
                        : 'text-status-escalated'
                  }`} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Target: 95%</p>
            </div>

            {/* Response SLA */}
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="space-y-1 flex-1">
                  <p className="text-xs text-muted-foreground font-medium">Response SLA</p>
                  <p className="text-2xl font-bold text-foreground">
                    {slaLoading ? '—' : `${(sla?.response_sla_pct ?? 0).toFixed(1)}%`}
                  </p>
                </div>
                <div className={`p-2 rounded ${
                  (sla?.response_sla_pct ?? 0) >= 95
                    ? 'bg-status-resolved/10'
                    : (sla?.response_sla_pct ?? 0) >= 90
                      ? 'bg-status-progress/10'
                      : 'bg-status-escalated/10'
                }`}>
                  <CheckCircle className={`h-5 w-5 ${
                    (sla?.response_sla_pct ?? 0) >= 95
                      ? 'text-status-resolved'
                      : (sla?.response_sla_pct ?? 0) >= 90
                        ? 'text-status-progress'
                        : 'text-status-escalated'
                  }`} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Target: 95%</p>
            </div>

            {/* At Risk */}
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="space-y-1 flex-1">
                  <p className="text-xs text-muted-foreground font-medium">At Risk</p>
                  <p className="text-2xl font-bold text-foreground">
                    {slaLoading ? '—' : sla?.at_risk ?? 0}
                  </p>
                </div>
                <div className="p-2 rounded bg-status-progress/10">
                  <AlertCircle className="h-5 w-5 text-status-progress" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Approaching deadline</p>
            </div>

            {/* Breached */}
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="space-y-1 flex-1">
                  <p className="text-xs text-muted-foreground font-medium">Breached</p>
                  <p className="text-2xl font-bold text-foreground">
                    {slaLoading ? '—' : sla?.breached ?? 0}
                  </p>
                </div>
                <div className="p-2 rounded bg-status-escalated/10">
                  <AlertCircle className="h-5 w-5 text-status-escalated" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Past deadline</p>
            </div>
          </div>
          </CardContent>
        </Card>
      </LazyMount>

      {/* Resolution Times — p50 and p90 (never a single mean) */}
      <LazyMount minHeight={220}>
        <Card className="overflow-hidden">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-base">Resolution Times</CardTitle>
            <CardDescription>p50 = median, p90 = 90th percentile (not mean)</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <KPICardGrid
              metrics={resolutionKPIs}
              loading={resLoading || !resTimes}
              columns={4}
            />
          </CardContent>
        </Card>
      </LazyMount>

      {/* Actionable insights — scoped to the caller's role */}
      <LazyMount minHeight={200}>
        <InsightsPanel insights={analyticsEnvelope?.insights ?? []} />
      </LazyMount>

    </div>
  );
}

export default RoleAnalyticsView;
