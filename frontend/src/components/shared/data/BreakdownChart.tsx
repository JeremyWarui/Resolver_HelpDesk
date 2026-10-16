import ChartCard from '@/components/shared/data/ChartCard';
import { ChartPlaceholder } from '@/components/shared/data/ChartPlaceholder';
import { AppBarChart } from '@/components/shared/data/AppBarChart';
import { AppPieChart } from '@/components/shared/data/AppPieChart';
import { useAnalytics } from '@/hooks/useAnalytics';
import { STATUS_LABELS } from '@/constants/tickets';
import type { AnalyticsParams, Dimension, Ticket } from '@/types';

interface Props {
  dimension: Dimension;
  title: string;
  description?: string;
  params?: AnalyticsParams;
  kind?: 'bar' | 'pie';
  height?: number;
}

/** Ticket volume by one dimension, as bars or a share-of-total pie. */
export default function BreakdownChart({
  dimension,
  title,
  description,
  params,
  kind = 'bar',
  height = 300,
}: Props) {
  const { data, loading } = useAnalytics({ ...params, group_by: dimension });
  const points = (data?.breakdown ?? []).map((row) => ({
    name:
      dimension === 'status'
        ? (STATUS_LABELS[row.key as Ticket['status']] ?? row.label)
        : row.label,
    value: row.total,
    tickets: row.total,
  }));

  return (
    <ChartCard title={title} description={description}>
      {loading ? (
        <ChartPlaceholder message="Loading…" />
      ) : points.length === 0 ? (
        <ChartPlaceholder message="No data for this period" />
      ) : kind === 'pie' ? (
        <AppPieChart data={points} height={height} />
      ) : (
        <AppBarChart data={points} height={height} />
      )}
    </ChartCard>
  );
}
