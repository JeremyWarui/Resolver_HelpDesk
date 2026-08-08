import type { ReactNode } from 'react';
import { usePerformanceSections, usePerformanceCampusDepts } from '@/hooks/analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { AlertCircle, Building2, MapPin, TrendingUp, BarChart3 } from 'lucide-react';
import MetricCard from '@/components/shared/data/MetricCard';
import type { AnalyticsParams } from '@/types';
import { CHART_COLORS as COLORS } from '@/constants/colors';
import { BarTooltip, PieTooltip } from '@/components/shared/data/ChartTooltips';

/**
 * Ticket load and SLA broken down by one dimension — sections or campuses.
 *
 * These were two files, 262 and 259 lines, differing on 29 of them: a hook, an
 * icon, a field name and some copy. Everything load-bearing — the donut, the
 * bar chart, the detail list, the SLA arithmetic, both tooltips — was byte
 * identical. Duplicated charts drift quietly: a fix to one tooltip or a change
 * of colour ramp lands on one page and not the other, and nobody notices
 * because the two are never on screen together.
 *
 * Adding a third dimension is now a row in DIMENSIONS.
 */

type Dimension = 'section' | 'campus';

interface Row {
  key: string | number;
  name: string;
  /** Small print under the name — campus for a section, nothing for a campus. */
  badge?: string;
  total: number;
  openCount?: number;
  escalatedCount: number;
  slaPct: number | null;
}

interface DimensionSpec {
  icon: ReactNode;
  countLabel: string;
  countDescription: string;
  avgLabel: string;
  avgDescription: string;
  distributionTitle: string;
  distributionDescription: string;
  volumeTitle: string;
  volumeDescription: string;
  detailsTitle: string;
  detailsDescription: string;
  emptyMessage: string;
  errorMessage: string;
}

const DIMENSIONS: Record<Dimension, DimensionSpec> = {
  section: {
    icon: <Building2 className="h-6 w-6 text-primary" />,
    countLabel: 'Total Sections',
    countDescription: 'Active sections',
    avgLabel: 'Avg per Section',
    avgDescription: 'Tickets per section',
    distributionTitle: 'Section Distribution Breakdown',
    distributionDescription: 'Percentage of total tickets by section',
    volumeTitle: 'Section Ticket Volume',
    volumeDescription: 'Number of tickets by section',
    detailsTitle: 'Section Performance Details',
    detailsDescription: 'Detailed breakdown of each section',
    emptyMessage: 'No section data available',
    errorMessage: 'Failed to load section analytics',
  },
  campus: {
    icon: <MapPin className="h-6 w-6 text-primary" />,
    countLabel: 'Total Campuses',
    countDescription: 'Campuses with tickets',
    avgLabel: 'Avg per Campus',
    avgDescription: 'Tickets per campus',
    distributionTitle: 'Campus Distribution Breakdown',
    distributionDescription: 'Percentage of total tickets by campus',
    volumeTitle: 'Campus Ticket Volume',
    volumeDescription: 'Number of tickets by campus',
    detailsTitle: 'Campus Performance Details',
    detailsDescription: 'Ticket load and SLA per campus',
    emptyMessage: 'No campus data available',
    errorMessage: 'Failed to load campus analytics',
  },
};

// ── Tooltips ──────────────────────────────────────────────────────────────────




// ── Component ─────────────────────────────────────────────────────────────────

const slaPercent = (met: number, total: number) =>
  total > 0 ? Math.round((met / total) * 100) : null;

export default function PerformanceBreakdownReport({
  dimension,
  params,
}: {
  dimension: Dimension;
  params?: AnalyticsParams;
}) {
  const spec = DIMENSIONS[dimension];
  const window = params ?? { days: 30 };

  // Both hooks always run — React forbids calling one conditionally — but each
  // is a cached query, so the unused one costs a single extra request per
  // window and is shared with the other tab that needs it.
  const sections = usePerformanceSections(window);
  const campuses = usePerformanceCampusDepts(window);
  const { data, loading, error } = dimension === 'section' ? sections : campuses;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-status-escalated">
        <AlertCircle className="h-5 w-5 mr-2" />
        <span>{spec.errorMessage}</span>
      </div>
    );
  }

  // Branch on the dimension *outside* the map: the discriminant is the prop,
  // not a field on the row, so TypeScript cannot narrow the union from inside.
  const rows: Row[] =
    dimension === 'section'
      ? (sections.data?.breakdown ?? []).map((item) => ({
          key: item.section_id,
          // Qualified by campus. Every campus's section is a "Maintenance"
          // section, so the bare type name drew five identical bars and a
          // legend reading Maintenance five times over. Keeping the type in
          // the label rather than using the campus alone means this still
          // reads correctly if Security or Transport sections are added.
          name: `${item.campus_code} · ${item.section_type_name}`,
          badge: `${item.campus_name} (${item.campus_code})`,
          total: item.total,
          escalatedCount: item.escalated_count,
          slaPct: slaPercent(item.resolution_sla_met, item.total_resolved_with_due),
        }))
      : (campuses.data?.breakdown ?? []).map((item) => ({
          key: item.cd_id,
          name: item.campus_name,
          total: item.total,
          openCount: item.open_count,
          escalatedCount: item.escalated_count,
          slaPct: slaPercent(item.resolution_sla_met, item.total_resolved_with_due),
        }));

  if (!data || rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <AlertCircle className="h-5 w-5 mr-2" />
        <span>{spec.emptyMessage}</span>
      </div>
    );
  }

  const totalTickets = rows.reduce((sum, r) => sum + (r.total ?? 0), 0);
  const average = rows.length > 0 ? (totalTickets / rows.length).toFixed(0) : '0';
  const barData = rows.map((r) => ({ name: r.name, tickets: r.total }));
  const pieData = rows.map((r, i) => ({
    name: r.name,
    value: r.total,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
        <MetricCard
          title={spec.countLabel}
          value={rows.length}
          description={spec.countDescription}
          icon={spec.icon}
          iconBgColor="bg-primary/10"
          className="bg-card"
        />
        <MetricCard
          title="Total Tickets"
          value={totalTickets}
          description="In selected date range"
          icon={<TrendingUp className="h-6 w-6 text-status-resolved" />}
          iconBgColor="bg-status-resolved/10"
          className="bg-card"
        />
        <MetricCard
          title={spec.avgLabel}
          value={average}
          description={spec.avgDescription}
          icon={<BarChart3 className="h-6 w-6 text-status-assigned" />}
          iconBgColor="bg-status-assigned/10"
          className="bg-card"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">{spec.distributionTitle}</CardTitle>
            <CardDescription>{spec.distributionDescription}</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ percent = 0 }: { percent?: number }) =>
                      `${((percent || 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{ fontSize: '12px' }}
                    formatter={(value) => <span style={{ fontSize: '10px' }}>{value}</span>}
                  />
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">{spec.volumeTitle}</CardTitle>
            <CardDescription>{spec.volumeDescription}</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  barCategoryGap={50}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edebe9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} width={30} />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="tickets" fill={COLORS[0]} radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="py-7 px-2">
        <CardHeader className="pb-5">
          <CardTitle className="pb-2">{spec.detailsTitle}</CardTitle>
          <CardDescription>{spec.detailsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          <div className="space-y-3">
            {rows.map((row, index) => {
              const percentage = totalTickets > 0 ? (row.total / totalTickets) * 100 : 0;
              return (
                <div
                  key={`${row.key}-${index}`}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground">{row.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {row.badge && (
                        <Badge variant="outline" className="text-xs">{row.badge}</Badge>
                      )}
                      <span className="text-sm text-muted-foreground">{row.total} tickets</span>
                      {row.openCount != null && (
                        <span className="text-xs text-status-open">{row.openCount} open</span>
                      )}
                      {row.escalatedCount > 0 && (
                        <span className="text-xs text-status-escalated">
                          {row.escalatedCount} escalated
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <div className="text-lg font-bold text-foreground">{percentage.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">of total</div>
                    {row.slaPct !== null && (
                      <div className="text-xs text-status-resolved font-medium">SLA {row.slaPct}%</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
