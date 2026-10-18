import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { TechnicianRow } from '@/types';
import { belowTarget, formatPct as pct } from '@/utils/format';
import { formatSeconds } from '@/utils/date';
import { cn } from '@/lib/utils';

interface TechnicianTableProps {
  rows: TechnicianRow[] | null;
  /** The on-time target; a technician below it reads red. */
  target: number | null | undefined;
  /** `week`: a dashboard's live view. `period`: a report over the chosen period. */
  variant: 'week' | 'period';
}

/** Who is carrying the work at a campus, and how it is going. */
export default function TechnicianTable({ rows, target, variant }: TechnicianTableProps) {
  const week = variant === 'week';
  return (
    <Card aria-label="Technicians" className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Technicians</CardTitle>
        <CardDescription>
          {week
            ? 'The last seven days. Open and overdue are right now.'
            : `Jobs raised this period and assigned to each.${target != null ? ` Target: ${target}% on time.` : ''}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows == null ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No technician works this campus yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-right text-sm text-muted-foreground">
                  <th className="p-2 text-left font-medium">Technician</th>
                  {week ? (
                    <>
                      <th className="p-2 font-medium">Open now</th>
                      <th className="p-2 font-medium">Overdue</th>
                      <th className="p-2 font-medium">Jobs this week</th>
                    </>
                  ) : (
                    <>
                      <th className="p-2 font-medium">Jobs</th>
                      <th className="p-2 font-medium">Open now</th>
                    </>
                  )}
                  <th className="p-2 font-medium">Resolved on time</th>
                  {!week && <th className="p-2 font-medium">Time to resolve</th>}
                  <th className="p-2 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody className="text-right">
                {rows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <th scope="row" className="p-2 text-left font-medium">{row.label}</th>
                    {week ? (
                      <>
                        <td className="p-2">{row.open_now}</td>
                        <td className={cn('p-2', row.overdue > 0 && 'font-semibold text-red-700')}>{row.overdue}</td>
                        <td className="p-2">{row.total}</td>
                      </>
                    ) : (
                      <>
                        <td className="p-2">{row.total}</td>
                        <td className="p-2">{row.open_now}</td>
                      </>
                    )}
                    <td className={cn('p-2 font-semibold', belowTarget(row.resolution_sla_pct, target) && 'text-red-700')}>
                      {pct(row.resolution_sla_pct)}
                    </td>
                    {!week && <td className="p-2">{formatSeconds(row.resolution_seconds_avg)}</td>}
                    <td className="p-2">{row.rating_avg ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
