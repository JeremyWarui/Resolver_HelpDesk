/**
 * Tickets per facility, split by trade — one stacked bar per building.
 *
 * Why stacked rather than one bar coloured by its dominant trade: the bar
 * length answers "which building consumes the section" and the segments answer
 * "with what kind of work", and those are the two halves of one decision. A bar
 * coloured by its winner throws the mix away and leans on a "dominant" that is
 * frequently a tie at this volume — EMB · Administration Block splits 33/33/33,
 * and colouring it "Masonry" would state something the data does not.
 *
 * Why horizontal: facility labels are long and campus-prefixed
 * ("EMB · Administration Block", "Staff Quarters (not registered)"). Vertical
 * bars force rotated labels, which is what the older reports chart does and why
 * its technician names are unreadable at an angle.
 *
 * Colour: categorical, fixed slot order by trade name, never cycled — a ninth
 * trade folds into "Other" rather than inventing a hue. The palette is the
 * validated `--viz-*` set (see index.css). Three light steps sit under 3:1,
 * which the relief rule permits only alongside a legend and a table of exact
 * figures — both of which this card ships, and FacilityHealthTable sits
 * directly below it.
 */
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePerformanceFacilities } from '@/hooks/analytics/usePerformanceFacilities';
import ChartCard from '@/components/shared/data/ChartCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useTradeColours, tradeBucket, OTHER_TRADE, TRADE_SLOTS } from '@/constants/tradeColours';
import type { AnalyticsParams } from '@/types';

interface Props {
  params?: AnalyticsParams;
  enabled?: boolean;
  /** Facilities to plot. The table below carries the rest. */
  limit?: number;
}

interface Row {
  facility: string;
  [trade: string]: string | number;
}

export function FacilityTradeChart({ params, enabled = true, limit = 8 }: Props) {
  const { data, loading } = usePerformanceFacilities(params, { enabled });
  const facilities = data?.facilities ?? [];

  const colour = useTradeColours();

  const { rows, trades } = useMemo(() => {
    const top = facilities.slice(0, limit);

    // Series present in this window; their colours come from the shared domain,
    // so a trade absent here keeps its slot rather than shifting the others.
    const names = [...new Set(top.flatMap((f) => f.trades.map((t) => t.trade)))].sort();
    const series = names.length > TRADE_SLOTS
      ? [...names.slice(0, TRADE_SLOTS), OTHER_TRADE]
      : names;

    // Longest bar at the top: a ranked chart read top-down needs its answer
    // first. Recharts plots the first datum at the bottom of a vertical layout,
    // so the array is reversed.
    const built: Row[] = top.map((f) => {
      const row: Row = { facility: f.facility };
      for (const s of series) row[s] = 0;
      for (const t of f.trades) {
        const key = tradeBucket(t.trade, colour);
        row[key] = (row[key] as number) + t.total;
      }
      return row;
    });

    return { rows: built.reverse(), trades: series };
  }, [facilities, limit, colour]);

  return (
    <ChartCard
      title="Where the work comes from"
      description="Tickets per facility, split by trade. Bar length is how much; the segments are what kind."
    >
      {loading ? (
        <Skeleton className="h-80 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No located tickets in this period.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 42 + 60)}>
            <BarChart
              layout="vertical"
              data={rows}
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              barCategoryGap="28%"
            >
              {/* Recessive grid — vertical only, since the measure runs along x. */}
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.6} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 13, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="facility"
                width={190}
                tick={{ fontSize: 13, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--card-foreground)',
                }}
                // Recharts renders zero-valued segments in the tooltip too,
                // which for a sparse cross-tab is mostly noise.
                formatter={(v: number, name: string) =>
                  v > 0 ? [v, name] : [null, null]
                }
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                iconType="square"
                iconSize={9}
              />
              {trades.map((trade) => (
                <Bar
                  key={trade}
                  dataKey={trade}
                  stackId="trade"
                  fill={colour.get(tradeBucket(trade, colour))}
                  // A 2px surface gap between segments, so adjacent fills read
                  // as separate marks rather than one blended band.
                  stroke="var(--card)"
                  strokeWidth={2}
                  radius={0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>

          <p className="mt-1 text-xs text-muted-foreground">
            The {rows.length} busiest locations. Exact figures, and the rest, are in
            the table below.
          </p>
        </>
      )}
    </ChartCard>
  );
}

export default FacilityTradeChart;
