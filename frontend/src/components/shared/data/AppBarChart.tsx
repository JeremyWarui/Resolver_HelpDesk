import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BarTooltip } from '@/components/shared/data/ChartTooltips';




interface AppBarChartProps {
  data: Record<string, unknown>[];
  dataKey?: string;
  height?: number;
  barSize?: number;
  barColor?: string;
  barCategoryGap?: number | string;
}

export function AppBarChart({
  data,
  dataKey = 'tickets',
  height = 250,
  barSize = 20,
  barColor = '#0078d4',
  barCategoryGap = 50,
}: AppBarChartProps) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
          barCategoryGap={barCategoryGap}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edebe9" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12 }}
            width={30}
          />
          <Tooltip content={<BarTooltip />} />
          <Bar dataKey={dataKey} fill={barColor} radius={[4, 4, 0, 0]} barSize={barSize} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
