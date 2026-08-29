import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import ChartCard from '@/components/shared/data/ChartCard';
import { useAnalytics } from '@/hooks/useAnalytics';
import { DIMENSION_LABELS, FIGURES, type FigureKey } from '@/constants/analytics';
import { STATUS_LABELS } from '@/constants/tickets';
import type { AnalyticsParams, Dimension, Ticket } from '@/types';

interface Props {
  dimension: Dimension;
  title: string;
  description?: string;
  params?: AnalyticsParams;
  /** Which figures to show as columns. Every caller states its own — there
   *  is no sensible default across a technician table and a campus one. */
  columns: FigureKey[];
}

/** The reported figures for one dimension, biggest bucket first. */
export default function BreakdownTable({
  dimension,
  title,
  description,
  params,
  columns,
}: Props) {
  const { data, loading } = useAnalytics({ ...params, group_by: dimension });
  const rows = data?.breakdown ?? [];

  return (
    <ChartCard title={title} description={description}>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No data for this period</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{DIMENSION_LABELS[dimension]}</TableHead>
                {columns.map((key) => (
                  <TableHead key={key} className="text-center">
                    {FIGURES[key].label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={String(row.key)}>
                  <TableCell className="font-medium text-sm">
                    {dimension === 'status'
                      ? (STATUS_LABELS[row.key as Ticket['status']] ?? row.label)
                      : row.label}
                  </TableCell>
                  {columns.map((key) => (
                    <TableCell key={key} className="text-center text-sm">
                      {FIGURES[key].render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ChartCard>
  );
}
