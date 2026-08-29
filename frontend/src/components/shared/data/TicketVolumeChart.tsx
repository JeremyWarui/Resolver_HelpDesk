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
}

/** Raised against settled, per bucket. Two series through `AppBarChart` rather
 *  than a second BarChart: the axes and grid are the same chart, and written
 *  twice they drifted. */
const SERIES = [
  { key: 'raised', name: 'Raised' },
  { key: 'settled', name: 'Settled' },
];

/** Tickets raised over the window, against how many of them are settled. */
export function TicketVolumeChart({
  trend,
  loading = false,
  title = 'Ticket Volume',
  height = 250,
  bucket = 'day',
}: TicketVolumeChartProps) {
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
          <AppBarChart data={data} height={height} series={SERIES} />
        )}
      </CardContent>
    </Card>
  );
}
