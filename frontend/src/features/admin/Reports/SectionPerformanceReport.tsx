import { usePerformanceSections } from '@/hooks/analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { AlertCircle, Building2, TrendingUp, BarChart3 } from 'lucide-react';
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

export default function SectionPerformanceReport({ params }: Props) {
  const { data, loading, error } = usePerformanceSections(params ?? { days: 30 });

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
        <span>Failed to load section analytics</span>
      </div>
    );
  }

  const breakdown = Array.isArray(data?.breakdown) ? data.breakdown : [];

  if (!data || breakdown.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Building2 className="h-5 w-5 mr-2" />
        <span>No section data available</span>
      </div>
    );
  }

  const sectionBarData = breakdown.map((item) => ({
    name: item.section_type_name,
    tickets: item.total,
  }));

  const sectionPieData = breakdown.map((item, index) => ({
    name: item.section_type_name,
    value: item.total,
    fill: COLORS[index % COLORS.length],
  }));

  const totalTickets = breakdown.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const avgPerSection = breakdown.length > 0
    ? (totalTickets / breakdown.length).toFixed(0)
    : '0';

  return (
    <div className="space-y-6">
      {/* Summary MetricCards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
        <MetricCard
          title="Total Sections"
          value={breakdown.length}
          description="Active sections"
          icon={<Building2 className="h-6 w-6 text-primary" />}
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
          title="Avg per Section"
          value={avgPerSection}
          description="Tickets per section"
          icon={<BarChart3 className="h-6 w-6 text-status-assigned" />}
          iconBgColor="bg-status-assigned/10"
          className="bg-card"
        />
      </div>

      {/* Charts — Donut (Pattern B) + Vertical Bar (Pattern A) */}
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
                    data={sectionPieData}
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
                    {sectionPieData.map((entry, index) => (
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
                  data={sectionBarData}
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

      {/* Section Details List */}
      <Card className="py-7 px-2">
        <CardHeader className="pb-5">
          <CardTitle className="pb-2">Section Performance Details</CardTitle>
          <CardDescription>Detailed breakdown of each section</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          <div className="space-y-3">
            {breakdown.map((section, index) => {
              const percentage = totalTickets > 0 ? (section.total / totalTickets) * 100 : 0;
              const slaPct = section.total_resolved_with_due > 0
                ? Math.round(section.resolution_sla_met / section.total_resolved_with_due * 100)
                : null;
              return (
                <div key={`${section.section_id}-${index}`} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground">{section.section_type_name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {section.campus_name} ({section.campus_code})
                      </Badge>
                      <span className="text-sm text-muted-foreground">{section.total} tickets</span>
                      {section.escalated_count > 0 && (
                        <span className="text-xs text-status-escalated">{section.escalated_count} escalated</span>
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
