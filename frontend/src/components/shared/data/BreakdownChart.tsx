import ChartCard from '@/components/shared/data/ChartCard';
import { AppPieChart } from '@/components/shared/data/AppPieChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import { STATUS_LABELS } from '@/constants/tickets';
import type { AnalyticsParams, Dimension, Ticket } from '@/types';

interface Props {
  dimension: Dimension;
  title: string;
  description?: string;
  params?: AnalyticsParams;
  height?: number;
}

/** Ticket volume by one dimension, as a share-of-total pie. */
export default function BreakdownChart({ dimension, title, description, params, height = 300 }: Props) {
  const { data, loading } = useAnalytics({ ...params, group_by: dimension });
  const points = (data?.breakdown ?? []).map((row) => ({
    name:
      dimension === 'status'
        ? (STATUS_LABELS[row.key as Ticket['status']] ?? row.label)
        : row.label,
    value: row.total,
  }));
  const message = loading ? 'Loading…' : points.length === 0 ? 'No data for this period' : null;

  return (
    <ChartCard title={title} description={description}>
      {message ? (
        <div className="h-[250px] w-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      ) : (
        <AppPieChart data={points} height={height} />
      )}
    </ChartCard>
  );
}
