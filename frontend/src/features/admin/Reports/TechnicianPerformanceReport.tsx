import { usePerformanceTechnicians } from '@/hooks/analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 border border-gray-200 rounded shadow-sm">
        <p className="text-xs font-medium text-gray-800 mb-1">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} className="text-xs text-gray-600">
            <span style={{ color: entry.color }}>●</span> {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

interface Props {
  params?: AnalyticsParams;
}

export default function TechnicianPerformanceReport({ params }: Props) {
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
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  dy={10}
                  interval={0}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} width={30} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px', paddingBottom: '12px' }} />
                <Bar dataKey="Resolved" stackId="stack" fill="#107c10" maxBarSize={45} />
                <Bar dataKey="Open"     stackId="stack" fill="#0078d4" maxBarSize={45} />
                <Bar dataKey="Pending"  stackId="stack" fill="#ffaa44" radius={[4, 4, 0, 0]} maxBarSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Performance Table */}
      <Card className="py-7 px-2">
        <CardHeader className="pb-5">
          <CardTitle className="pb-2">Detailed Performance Metrics</CardTitle>
          <CardDescription>Comprehensive view of all technician metrics</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-muted/50">
                  <TableHead className="font-semibold">Technician</TableHead>
                  <TableHead className="text-center font-semibold">Open</TableHead>
                  <TableHead className="text-center font-semibold">Resolved</TableHead>
                  <TableHead className="text-center font-semibold">Pending</TableHead>
                  <TableHead className="text-center font-semibold">Total Assigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTechnicians.length > 0 ? (
                  sortedTechnicians.map((tech, i) => (
                    <TableRow key={tech.technician_id ?? `tech-${i}`} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div>
                          <div>{getTechName(tech)}</div>
                          <div className="text-xs text-muted-foreground">@{tech.username}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-[#0078d4]">
                          <AlertTriangle className="h-4 w-4" />
                          {tech.open_count ?? 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-[#107c10]">
                          <CheckCircle className="h-4 w-4" />
                          {tech.resolved_count ?? 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-[#ffaa44]">
                          <AlertTriangle className="h-4 w-4" />
                          {tech.escalated_count ?? 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{tech.total_assigned ?? 0}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No technician data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
