import { usePerformanceTechnicians } from '@/hooks/analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { AlertCircle, CheckCircle, AlertTriangle, Users } from 'lucide-react';
import MetricCard from '@/components/shared/data/MetricCard';
import type { AnalyticsParams } from '@/types';
import { SeriesTooltip } from '@/components/shared/data/ChartTooltips';
import { TechnicianBreakdownTable } from '@/components/shared/data/TechnicianPerformanceTable';




/**
 * The technician roster — one row per person, for a supervisor.
 *
 * Answers "who on my team is overloaded", so it is a comparison across people
 * and only ever shown to admin, manager, HOD and HOS. A technician's own
 * figures live in `MyPerformancePanel`, which deliberately ranks nobody:
 * `role_config.py` sets `comparison: False` for them and will not serve a peer
 * breakdown, so this report is not offered to that role at all.
 */

interface Props {
  params?: AnalyticsParams;
}

export default function TeamPerformanceReport({ params }: Props) {
  const { data, loading, error } = usePerformanceTechnicians(params);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-status-escalated">
        <AlertCircle className="h-5 w-5 mr-2" />
        <span>Failed to load technician analytics</span>
      </div>
    );
  }

  if (!data) return null;

  const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];

  const sortedTechnicians = [...breakdown].sort(
    (a, b) => (b.total_assigned ?? 0) - (a.total_assigned ?? 0)
  );

  const getTechName = (item: { first_name: string; last_name: string; username: string }) =>
    `${item.first_name} ${item.last_name}`.trim() || item.username;

  const chartData = sortedTechnicians.slice(0, 10).map((tech) => ({
    name: getTechName(tech),
    Resolved: tech.resolved_count ?? 0,
    Open: tech.open_count ?? 0,
    Pending: tech.escalated_count ?? 0,
  }));

  const avgOpenLoad = breakdown.length > 0
    ? (breakdown.reduce((sum, t) => sum + (t.open_count ?? 0), 0) / breakdown.length).toFixed(1)
    : '0.0';

  const avgResolved = breakdown.length > 0
    ? (breakdown.reduce((sum, t) => sum + (t.resolved_count ?? 0), 0) / breakdown.length).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      {/* Summary MetricCards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
        <MetricCard
          title="Total Technicians"
          value={breakdown.length}
          description="Active technicians"
          icon={<Users className="h-6 w-6 text-primary" />}
          iconBgColor="bg-primary/10"
          className="bg-white"
        />
        <MetricCard
          title="Avg Open Load"
          value={avgOpenLoad}
          description="Average open tickets per technician"
          icon={<AlertTriangle className="h-6 w-6 text-status-escalated" />}
          iconBgColor="bg-status-escalated/10"
          className="bg-white"
        />
        <MetricCard
          title="Avg Resolved"
          value={avgResolved}
          description="Average resolved tickets per technician"
          icon={<CheckCircle className="h-6 w-6 text-status-resolved" />}
          iconBgColor="bg-status-resolved/10"
          className="bg-white"
        />
      </div>

      {/* Stacked Bar Chart — Pattern D */}
      <Card className="py-7 px-2">
        <CardHeader className="pb-5">
          <CardTitle className="pb-2">Technician Workload Distribution</CardTitle>
          <CardDescription>Stacked view of resolved, open, and pending tickets per technician</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          <div className="h-[550px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 60 }}
                barCategoryGap="55%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edebe9" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 13 }}
                  angle={-45}
                  textAnchor="end"
                  dy={10}
                  interval={0}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 13 }} width={30} />
                <Tooltip content={<SeriesTooltip />} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px', paddingBottom: '12px' }} />
                <Bar dataKey="Resolved" stackId="stack" fill="#107c10" maxBarSize={45} />
                <Bar dataKey="Open"     stackId="stack" fill="#0078d4" maxBarSize={45} />
                <Bar dataKey="Pending"  stackId="stack" fill="#ffaa44" radius={[4, 4, 0, 0]} maxBarSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Performance Table — the shared sortable one.
          This was a hand-rolled <Table> over the same rows from the same
          endpoint as TechnicianBreakdownTable, minus the sorting, and with a
          column headed "Pending" that rendered `escalated_count` — there is no
          pending_count on the row at all. Two tables of one thing meant the
          mislabelled one was never read next to the correct one. */}
      <Card className="py-7 px-2">
        <CardHeader className="pb-5">
          <CardTitle className="pb-2">Detailed Performance Metrics</CardTitle>
          <CardDescription>Comprehensive view of all technician metrics</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          <TechnicianBreakdownTable data={data} loading={loading} bare />
        </CardContent>
      </Card>
    </div>
  );
}
