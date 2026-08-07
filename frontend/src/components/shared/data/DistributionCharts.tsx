import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const COLORS = ['#0078d4', '#107c10', '#ffaa44', '#d13438', '#5c2d91', '#00b4d8'];

export interface DistributionDatum {
  name: string;
  total: number;
}

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
  data: DistributionDatum[] | undefined;
  loading?: boolean;
  distributionTitle: string;
  distributionDescription: string;
  volumeTitle: string;
  volumeDescription: string;
  emptyLabel?: string;
}

export default function DistributionCharts({
  data,
  loading = false,
  distributionTitle,
  distributionDescription,
  volumeTitle,
  volumeDescription,
  emptyLabel = 'No data available',
}: Props) {
  const rows = data ?? [];
  const pieData = rows.map((d, i) => ({ name: d.name, value: d.total, fill: COLORS[i % COLORS.length] }));
  const barData = rows.map((d) => ({ name: d.name, tickets: d.total }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {/* Distribution donut */}
      <Card className="py-7 px-2">
        <CardHeader className="pb-5">
          <CardTitle className="pb-2">{distributionTitle}</CardTitle>
          <CardDescription>{distributionDescription}</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">{emptyLabel}</p>
          ) : (
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
                  <RechartsTooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Volume bar */}
      <Card className="py-7 px-2">
        <CardHeader className="pb-5">
          <CardTitle className="pb-2">{volumeTitle}</CardTitle>
          <CardDescription>{volumeDescription}</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : barData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">{emptyLabel}</p>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 60 }}
                  barCategoryGap={50}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edebe9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12 }}
                    width={30}
                    allowDecimals={false}
                  />
                  <RechartsTooltip content={<BarTooltip />} />
                  <Bar dataKey="tickets" fill="#0078d4" radius={[4, 4, 0, 0]} barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
