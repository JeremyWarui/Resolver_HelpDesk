import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AppBarChart } from '@/components/shared/data/AppBarChart';
import { bucketLabel } from '@/utils/date';
import type { Bucket, TrendPoint } from '@/types';

interface TicketVolumeChartProps {
  trend: TrendPoint[] | null;
  loading?: boolean;
  title?: string;
  height?: number;
  bucket?: Bucket;
  /** The name of the second series in the legend and tooltip. */
  settledLabel?: string;
  /** Bar width in px; a long period reads better with narrow bars. */
  barSize?: number;
}

/** Tickets raised over the window, against how many of them are settled: two
 *  series on one `AppBarChart`, so they share the axes and grid. */
export function TicketVolumeChart({
  trend,
  loading = false,
  title = 'Ticket Volume',
  height = 250,
  bucket = 'day',
  settledLabel = 'Settled',
  barSize,
}: TicketVolumeChartProps) {
  const series = [
    { key: 'raised', name: 'Raised' },
    { key: 'settled', name: settledLabel },
  ];
  const data = (trend ?? []).map((point) => ({
    name: bucketLabel(point.bucket, bucket),
    raised: point.total,
    settled: point.settled,
  }));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4 pt-6 px-6">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-4">
        {loading ? (
          <Skeleton style={{ height }} className="w-full rounded-md" />
        ) : (
          <AppBarChart data={data} height={height} series={series} barSize={barSize} />
        )}
      </CardContent>
    </Card>
  );
}
