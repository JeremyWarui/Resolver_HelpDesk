import ChartCard from '@/components/shared/data/ChartCard';
import { ChartPlaceholder } from '@/components/shared/data/ChartPlaceholder';
import { AppBarChart } from '@/components/shared/data/AppBarChart';
import { AppPieChart } from '@/components/shared/data/AppPieChart';
import RangeSelector from '@/components/shared/data/RangeSelector';
import { RANGES, type RangeKey } from '@/constants/analytics';
import { STATUS_LABELS } from '@/constants/tickets';
import { bucketLabel } from '@/utils/date';
import type { Ticket } from '@/types';
import type { BreakdownRow, TrendPoint } from '@/types';

interface Props {
  trend: TrendPoint[] | null;
  trendLoading: boolean;
  /** The breakdown of a `group_by=status` envelope. */
  byStatus: BreakdownRow[] | null;
  statusLoading: boolean;
  trendRange: RangeKey;
  setTrendRange: (key: RangeKey) => void;
  statusRange: RangeKey;
  setStatusRange: (key: RangeKey) => void;
}

/** Two dashboard charts: tickets raised over time, and their status split. */
export default function ChartsSection({
  trend,
  trendLoading,
  byStatus,
  statusLoading,
  trendRange,
  setTrendRange,
  statusRange,
  setStatusRange,
}: Props) {
  const raised = (trend ?? []).map((point) => ({
    name: bucketLabel(point.bucket, RANGES[trendRange].bucket),
    tickets: point.total,
  }));

  const pieData = (byStatus ?? []).map((row) => ({
    name: STATUS_LABELS[row.key as Ticket['status']] ?? row.label,
    value: row.total,
  }));

  return (
    <div className="grid grid-cols-7 gap-2 mb-2">
      <ChartCard
        className="col-span-4"
        title="Tickets Raised"
        description="Tickets raised within the period"
        action={<RangeSelector value={trendRange} onChange={setTrendRange} />}
        contentClassName="p-5 pt-1"
      >
        {trendLoading ? (
          <ChartPlaceholder message="Loading ticket data..." />
        ) : raised.length === 0 ? (
          <ChartPlaceholder message="No data available" />
        ) : (
          <AppBarChart data={raised} height={375} />
        )}
      </ChartCard>

      <ChartCard
        className="col-span-3"
        title="Tickets by Status"
        description="Status breakdown for the period"
        action={<RangeSelector value={statusRange} onChange={setStatusRange} />}
        contentClassName="p-4 pt-0"
      >
        {statusLoading ? (
          <ChartPlaceholder message="Loading statuses..." />
        ) : pieData.length === 0 ? (
          <ChartPlaceholder message="No data available" />
        ) : (
          <AppPieChart data={pieData} height={375} innerRadius={75} outerRadius={120} />
        )}
      </ChartCard>
    </div>
  );
}
