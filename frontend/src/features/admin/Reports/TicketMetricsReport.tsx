import { useState } from 'react';
import { useAnalytics } from '@/hooks/analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { TrendingUp, AlertCircle } from 'lucide-react';
import type { AnalyticsParams } from '@/types';

interface FacilityDemandRow {
  facility_type_id: number;
  facility_type_name: string;
  count: number;
}

const STATUS_COLORS: Record<string, string> = {
  open:        '#3b82f6',
  assigned:    '#f59e0b',
  in_progress: '#8b5cf6',
  resolved:    '#10b981',
  closed:      '#6b7280',
  on_hold:     '#ef4444',
};

const COLORS = ['#0078d4', '#107c10', '#ffaa44', '#d13438', '#5c2d91', '#00b4d8'];

interface TooltipPayload {
  name: string;
  value: number;
}

interface BarTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

const BarTooltip = ({ active, payload, label }: BarTooltipProps) => {
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

const PieTooltip = ({ active, payload }: BarTooltipProps) => {
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

const GRANULARITY_DAYS: Record<'day' | 'week' | 'month' | 'quarter', number> = {
  day: 14, week: 56, month: 180, quarter: 365,
};

export default function TicketMetricsReport({ params: externalParams }: Props) {
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month' | 'quarter'>('day');

  const params: AnalyticsParams = externalParams ?? { days: GRANULARITY_DAYS[granularity] };

  const { data, loading, error } = useAnalytics({ ...params, group_by: 'section', granularity });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-red-600">
        <AlertCircle className="h-5 w-5 mr-2" />
        <span>Failed to load ticket metrics</span>
      </div>
    );
  }

  if (!data) return null;

  const statusCounts = data.series?.status_distribution ?? [];
  const facilityDistribution =
    (data.demand?.by_facility_type as FacilityDemandRow[] | undefined) ?? [];
  const sectionDistribution = data.breakdown?.rows ?? [];
  const trendDataRaw = data.series?.flow_trend ?? [];

  const statusChartData = statusCounts.map((item) => ({
    name: item.status.replace('_', ' ').toUpperCase(),
    value: item.count,
    fill: STATUS_COLORS[item.status] || '#6b7280',
  }));

  const facilityChartData = facilityDistribution.slice(0, 10).map((item) => ({
    name: item.facility_type_name,
    value: item.count,
  }));

  const sectionChartData = sectionDistribution.slice(0, 10).map((item) => ({
    name: String(item.label ?? item.section_type_name ?? item.key ?? '—'),
    tickets: Number(item.total ?? 0),
  }));

  const trendData = trendDataRaw.map((item) => ({
    date: formatTrendDate(item.date, granularity),
    tickets: item.created,
  }));

  const facilityChartConfig = {
    value: { label: 'Tickets', color: 'hsl(210, 100%, 50%)' },
    label: { color: 'gray' },
  } satisfies ChartConfig;

  return (
    <div className="space-y-6">
      {/* Single granularity selector drives both window and bucketing */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-gray-500" />
        <Select value={granularity} onValueChange={(value) => setGranularity(value as 'day' | 'week' | 'month' | 'quarter')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="View by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Daily (last 2 weeks)</SelectItem>
            <SelectItem value="week">Weekly (last 8 weeks)</SelectItem>
            <SelectItem value="month">Monthly (last 6 months)</SelectItem>
            <SelectItem value="quarter">Quarterly (last year)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* First Row: Status Distribution (Donut) + Sections Chart (Bar) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Distribution — Pattern B */}
        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">Status Distribution</CardTitle>
            <CardDescription>Breakdown of tickets by current status</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
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
                    {statusChartData.map((entry, index) => (
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

        {/* Top Sections — Pattern A */}
        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">Top Sections by Ticket Volume</CardTitle>
            <CardDescription>Sections with the most maintenance requests</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sectionChartData}
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

      {/* Second Row: Facilities (Pattern C — shadcn horizontal bar) + Ticket Trends (Pattern A) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Facilities — Pattern C (shadcn horizontal bar) */}
        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">Top Facilities by Ticket Volume</CardTitle>
            <CardDescription>Facilities with the most tickets</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <ChartContainer config={facilityChartConfig} className="min-h-[300px]">
              <BarChart data={facilityChartData} layout="vertical" margin={{ left: 3, right: 30, top: 10, bottom: 10 }}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'gray' }}
                  width={120}
                />
                <XAxis dataKey="value" type="number" />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Bar dataKey="value" fill="hsl(210, 100%, 50%)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Ticket Trends — Pattern A (vertical bar) */}
        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">Ticket Trends</CardTitle>
            <CardDescription>Ticket creation over time</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trendData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  barCategoryGap={50}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edebe9" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    dy={10}
                    interval={Math.floor(trendData.length / 8)}
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

      {/* Third Row: Section Distribution Breakdown (Pattern B) + Section Ticket Volume (Pattern A) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Section Distribution — Pattern B */}
        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">Section Distribution Breakdown</CardTitle>
            <CardDescription>Percentage of total tickets by section</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectionChartData.map((d, i) => ({ name: d.name, value: d.tickets, fill: COLORS[i % COLORS.length] }))}
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
                    {sectionChartData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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

        {/* Section Ticket Volume — Pattern A */}
        <Card className="py-7 px-2">
          <CardHeader className="pb-5">
            <CardTitle className="pb-2">Section Ticket Volume</CardTitle>
            <CardDescription>Number of tickets by section</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sectionChartData}
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
    </div>
  );
}

function formatTrendDate(dateStr: string, granularity: 'day' | 'week' | 'month' | 'quarter'): string {
  const date = new Date(dateStr);
  switch (granularity) {
    case 'day':
    case 'week':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    case 'quarter': {
      const q = Math.floor(date.getMonth() / 3) + 1;
      return `Q${q} '${String(date.getFullYear()).slice(2)}`;
    }
  }
}
