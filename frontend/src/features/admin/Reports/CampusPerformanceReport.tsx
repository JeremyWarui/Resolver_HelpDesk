import { usePerformanceCampusDepts } from '@/hooks/analytics';
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { AlertCircle, MapPin, TrendingUp, BarChart3 } from 'lucide-react';
import MetricCard from '@/components/shared/data/MetricCard';
import type { AnalyticsParams } from '@/types';

const COLORS = ['#0078d4', '#107c10', '#ffaa44', '#d13438', '#5c2d91', '#00b4d8'];

interface TooltipPayload {
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

const BarTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 border border-gray-200 rounded shadow-sm">
        <p className="text-xs font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-600">Tickets: {payload[0].value}</p>
      </div>
    );
  }
  return null;
};

const PieTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 border border-gray-200 rounded shadow-sm">
        <p className="text-xs font-medium text-gray-800">{payload[0].name}</p>
        <p className="text-xs text-gray-600">Tickets: {payload[0].value}</p>
      </div>
    );
  }
  return null;
};

interface Props {
  params?: AnalyticsParams;
}

export default function CampusPerformanceReport({ params }: Props) {
  const { data, loading, error } = usePerformanceCampusDepts(params ?? { days: 30 });

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
        <span>Failed to load campus analytics</span>
      </div>
    );
  }

  const breakdown = Array.isArray(data?.breakdown) ? data.breakdown : [];

  if (!data || breakdown.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <MapPin className="h-5 w-5 mr-2" />
        <span>No campus data available</span>
      </div>
    );
  }

  const campusBarData = breakdown.map((item) => ({
    name: item.campus_name,
    tickets: item.total,
  }));

  const campusPieData = breakdown.map((item, index) => ({
    name: item.campus_name,
    value: item.total,
    fill: COLORS[index % COLORS.length],
  }));

  const totalTickets = breakdown.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const avgPerCampus = breakdown.length > 0
    ? (totalTickets / breakdown.length).toFixed(0)
    : '0';

  return (
    <div className="space-y-6">
      {/* Summary MetricCards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
        <MetricCard
          title="Total Campuses"
          value={breakdown.length}
          description="Campuses with tickets"
          icon={<MapPin className="h-6 w-6 text-primary" />}
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
          title="Avg per Campus"
          value={avgPerCampus}
          description="Tickets per campus"
          icon={<BarChart3 className="h-6 w-6 text-status-assigned" />}
          iconBgColor="bg-status-assigned/10"
          className="bg-card"
        />
      </div>

      {/* Charts — Donut (Pattern B) + Vertical Bar (Pattern A) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Campus Distribution — Pattern B */}
        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">Campus Distribution Breakdown</CardTitle>
            <CardDescription>Percentage of total tickets by campus</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={campusPieData}
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
                    {campusPieData.map((entry, index) => (
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

        {/* Campus Ticket Volume — Pattern A */}
        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">Campus Ticket Volume</CardTitle>
            <CardDescription>Number of tickets by campus</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={campusBarData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  barCategoryGap={50}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edebe9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} width={30} />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="tickets" fill="#0078d4" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campus Details List */}
      <Card className="py-7 px-2">
        <CardHeader className="pb-5">
          <CardTitle className="pb-2">Campus Performance Details</CardTitle>
          <CardDescription>Ticket load and SLA per campus</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          <div className="space-y-3">
            {breakdown.map((campus, index) => {
              const percentage = totalTickets > 0 ? (campus.total / totalTickets) * 100 : 0;
              const slaPct = campus.total_resolved_with_due > 0
                ? Math.round(campus.resolution_sla_met / campus.total_resolved_with_due * 100)
                : null;
              return (
                <div key={`${campus.cd_id}-${index}`} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground">{campus.campus_name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-muted-foreground">{campus.total} tickets</span>
                      <span className="text-xs text-status-open">{campus.open_count} open</span>
                      {campus.escalated_count > 0 && (
                        <span className="text-xs text-status-escalated">{campus.escalated_count} escalated</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <div className="text-lg font-bold text-foreground">{percentage.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">of total</div>
                    {slaPct !== null && (
                      <div className="text-xs text-status-resolved font-medium">SLA {slaPct}%</div>
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
