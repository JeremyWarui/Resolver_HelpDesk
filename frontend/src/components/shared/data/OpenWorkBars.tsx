import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** The three stages of live work, in the order a job moves through them. */
const STAGES = [
  { key: 'waiting', label: 'Waiting', color: '#e0973f' },
  { key: 'with_technician', label: 'With a technician', color: '#1d5fc4' },
  { key: 'on_hold', label: 'On hold', color: '#8b6bb8' },
] as const;

interface OpenWorkRow {
  key: number;
  label: string;
  open_now: number;
  waiting: number;
  with_technician: number;
  on_hold: number;
}

interface OpenWorkBarsProps {
  title: string;
  rows: OpenWorkRow[] | null;
  /** Sits at the right of the title, such as a period picker. */
  action?: ReactNode;
}

/** Live work as one stacked bar per row, split by stage. The rows share the
 *  card's height, so the chart fills it beside a taller card. */
export default function OpenWorkBars({ title, rows, action }: OpenWorkBarsProps) {
  const most = Math.max(1, ...(rows ?? []).map((r) => r.open_now));
  return (
    <Card aria-label={title} className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {action}
        </div>
        <CardDescription className="flex flex-wrap gap-3">
          {STAGES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {rows == null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ul className="flex flex-1 flex-col gap-2">
            {rows.map((row) => (
              <li key={row.key} className="grid min-h-8 flex-1 grid-cols-[6rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm tabular-nums">
                <span>{row.label}</span>
                <span
                  className="flex h-1/2 max-h-8 min-h-3.5 overflow-hidden rounded"
                  style={{ width: `${(row.open_now / most) * 100}%` }}
                  role="img"
                  aria-label={`${row.label}: ${row.waiting} waiting, ${row.with_technician} with a technician, ${row.on_hold} on hold`}
                >
                  {STAGES.map((s) =>
                    row[s.key] ? (
                      <span key={s.key} style={{ width: `${(row[s.key] / row.open_now) * 100}%`, background: s.color }} />
                    ) : null,
                  )}
                </span>
                <span className="text-right">{row.open_now}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
