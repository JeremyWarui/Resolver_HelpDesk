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
import { BarTooltip, SeriesTooltip } from '@/components/shared/data/ChartTooltips';

interface AppBarChartProps {
  data: Record<string, unknown>[];
  height?: number;
  /** One bar per entry, drawn in palette order unless a colour is given. The
   *  legend appears only for more than one, where it is the only thing saying
   *  which bar is which. */
  series?: { key: string; name?: string; color?: string }[];
}

const DEFAULT_SERIES = [{ key: 'tickets' }];

/** The bar chart every report draws: one series or several, same axes. */
export function AppBarChart({ data, height = 250, series = DEFAULT_SERIES }: AppBarChartProps) {
  const multi = series.length > 1;

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
          <Tooltip content={multi ? <SeriesTooltip /> : <BarTooltip />} />
          {multi && <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
