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
  /** Pixels, or a share of the space left by the legend, e.g. '55%'. */
  innerRadius?: number | string;
  outerRadius?: number | string;
}

/** A share-of-total donut with its legend underneath, so a narrow card
 *  never puts the legend over the ring. */
export function AppPieChart({
  data,
  height = 250,
  innerRadius = '44%',
  outerRadius = '62%',
}: AppPieChartProps) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
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
            layout="horizontal"
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ fontSize: '12px' }}
            formatter={(value) => <span style={{ fontSize: '10px' }}>{value}</span>}
          />
          <Tooltip content={<PieTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
