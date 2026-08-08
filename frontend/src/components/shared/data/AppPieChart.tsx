import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS as COLORS } from '@/constants/colors';
import { PieTooltip } from '@/components/shared/data/ChartTooltips';





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
          <Tooltip content={<PieTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
