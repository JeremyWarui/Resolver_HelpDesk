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
import { CHART_COLORS } from '@/constants/colors';
import { SeriesTooltip } from '@/components/shared/data/ChartTooltips';

interface AppBarChartProps {
  data: Record<string, unknown>[];
  height: number;
  /** One bar per entry, side by side, drawn in palette order. The legend says which is which. */
  series: { key: string; name: string }[];
  /** Bar width in px. */
  barSize?: number;
}

/** Several series of bars on shared axes. */
export function AppBarChart({ data, height, series, barSize = 20 }: AppBarChartProps) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
          barCategoryGap={50}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edebe9" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 13 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 13 }} width={30} allowDecimals={false} />
          <Tooltip content={<SeriesTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
              barSize={barSize}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
