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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { FlowTrendPoint } from '@/types';
import type { Granularity } from '@/components/shared/GranularitySelector';
import { SeriesTooltip } from '@/components/shared/data/ChartTooltips';

export interface VolumeSeries {
  date: string;
  created: number;
  resolved: number;
}

interface TicketVolumeChartProps {
  data: VolumeSeries[];
  loading?: boolean;
  title?: string;
  totalOnly?: boolean;
  height?: number;
}

interface TicketVolumeChartFlowProps {
  trend: FlowTrendPoint[] | null;
  loading?: boolean;
  title?: string;
  totalOnly?: boolean;
  height?: number;
  granularity?: Granularity;
}




export function TicketVolumeChart({
  data,
  loading = false,
  title = 'Ticket Volume',
  totalOnly = false,
  height = 250,
}: TicketVolumeChartProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4 pt-6 px-6">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-4">
        {loading ? (
          <Skeleton style={{ height }} className="w-full rounded-md" />
        ) : (
          <div style={{ height }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                barCategoryGap={50}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edebe9" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 13 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 13 }}
                  width={30}
                  allowDecimals={false}
                />
                <Tooltip content={<SeriesTooltip />} />
                {!totalOnly && <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />}
                <Bar dataKey="created" name="Created" fill="#0078d4" radius={[4, 4, 0, 0]} barSize={20} />
                {!totalOnly && (
                  <Bar dataKey="resolved" name="Resolved" fill="#107c10" radius={[4, 4, 0, 0]} barSize={20} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FlowTrendChart({
  trend,
  loading = false,
  title = 'Ticket Flow',
  totalOnly = false,
  height,
  granularity = 'day',
}: TicketVolumeChartFlowProps) {
  const data: VolumeSeries[] = (trend ?? []).map((pt) => ({
    date: formatFlowDate(pt.date, granularity),
    created: pt.created,
    resolved: pt.resolved,
  }));

  return (
    <TicketVolumeChart
      data={data}
      loading={loading}
      title={title}
      totalOnly={totalOnly}
      height={height}
    />
  );
}

function formatFlowDate(dateStr: string, granularity: Granularity): string {
  const date = new Date(dateStr);
  switch (granularity) {
    case 'day':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
