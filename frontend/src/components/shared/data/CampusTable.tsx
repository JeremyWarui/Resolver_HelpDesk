import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { OverviewCampus } from '@/types';
import { belowTarget, formatHours as hours, formatPct as pct } from '@/utils/format';
import { cn } from '@/lib/utils';

interface CampusTableProps {
  rows: OverviewCampus[] | null;
  /** The on-time target; a campus below it reads red. */
  target: number | null | undefined;
  description?: ReactNode;
  /** Makes each campus name a button that picks it. */
  onPick?: (id: number) => void;
}

/** The Campuses table: each campus's period, its live work and its staffing. */
export default function CampusTable({ rows, target, description, onPick }: CampusTableProps) {
  return (
    <Card aria-label="Campuses">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Campuses</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {rows == null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-right text-sm text-muted-foreground">
                  <th className="p-2 text-left font-medium">Campus</th>
                  <th className="p-2 font-medium">Raised</th>
                  <th className="p-2 font-medium">Open now</th>
                  <th className="p-2 font-medium">Overdue</th>
                  <th className="p-2 font-medium">With HOD</th>
                  <th className="p-2 font-medium">Resolved on time</th>
                  <th className="p-2 font-medium">Time to resolve</th>
                  <th className="p-2 font-medium">Rating</th>
                  <th className="p-2 font-medium">Technicians</th>
                  <th className="p-2 font-medium">Jobs each</th>
                </tr>
              </thead>
              <tbody className="text-right">
                {rows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <th scope="row" className="p-2 text-left font-medium">
                      {onPick ? (
                        <button type="button" className="text-primary hover:underline" onClick={() => onPick(row.key)}>
                          {row.label}
                        </button>
                      ) : (
                        row.label
                      )}
                    </th>
                    <td className="p-2">{row.total}</td>
                    <td className="p-2">{row.open_now}</td>
                    <td className="p-2">{row.overdue}</td>
                    <td className="p-2">{row.at_hod}</td>
                    <td className={cn('p-2 font-semibold', belowTarget(row.resolution_sla_pct, target) && 'text-red-700')}>
                      {pct(row.resolution_sla_pct)}
                    </td>
                    <td className="p-2">{hours(row.resolution_seconds_avg)}</td>
                    <td className="p-2">{row.rating_avg ?? '—'}</td>
                    <td className="p-2">{row.technicians}</td>
                    <td className="p-2">{row.jobs_each ?? '—'}</td>
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
