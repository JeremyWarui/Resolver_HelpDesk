import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import ChartCard from '@/components/shared/data/ChartCard';
import { timeAgo } from '@/utils/date';
import type { Bottleneck } from '@/types';

interface Props {
  bottlenecks: Bottleneck[] | null;
  loading?: boolean;
}

/**
 * What is on hold right now, by reason. A snapshot of this moment, not of the
 * window: a hold reason clears when work resumes, so there is no hold history.
 */
export default function HoldsPanel({ bottlenecks, loading = false }: Props) {
  return (
    <ChartCard title="On Hold" description="Work paused right now, and why">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !bottlenecks?.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nothing on hold</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reason</TableHead>
              <TableHead className="text-center">Tickets</TableHead>
              <TableHead className="text-center">Oldest hold</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bottlenecks.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium text-sm">{row.label}</TableCell>
                <TableCell className="text-center text-sm">{row.total}</TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {row.since ? timeAgo(row.since) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ChartCard>
  );
}
