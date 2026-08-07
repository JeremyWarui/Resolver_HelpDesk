import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#0078d4', '#107c10', '#ffaa44', '#d13438', '#5c2d91', '#00b4d8'];

interface TooltipPayload {
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
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

interface AppPieChartProps {
  data: { name: string; value: number }[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
}

export function AppPieChart({
  data,
  height = 250,
  innerRadius = 50,
  outerRadius = 80,
}: AppPieChartProps) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={5}
            dataKey="value"
            label={({ percent = 0 }: { percent?: number }) =>
              `${((percent || 0) * 100).toFixed(0)}%`
            }
            labelLine={false}
          >
            {data.map((_entry, index) => (
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
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
