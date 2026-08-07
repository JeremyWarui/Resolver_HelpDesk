import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TooltipPayload {
  value: number;
  payload: Record<string, unknown>;
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
        <p className="text-xs font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-600">Tickets: {payload[0].value}</p>
      </div>
    );
  }
  return null;
};

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
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey={dataKey} fill={barColor} radius={[4, 4, 0, 0]} barSize={barSize} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
