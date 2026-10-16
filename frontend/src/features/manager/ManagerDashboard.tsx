import { AlertTriangle, CheckCircle2, FileText, Hourglass, Inbox, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import CampusTable from '@/components/shared/data/CampusTable';
import { MetricCardRow, type StatConfig } from '@/components/shared/data/MetricCard';
import { TicketVolumeChart } from '@/components/shared/data/TicketVolumeChart';
import { useManagerDashboard } from '@/hooks/useAnalytics';
import type { DashboardEnvelope } from '@/types';
import { formatSeconds } from '@/utils/date';

/** The three stages of live work, in the order a job moves through them. */
const STAGES = [
  { key: 'waiting', label: 'Waiting', color: '#e0973f' },
  { key: 'with_technician', label: 'With a technician', color: '#1d5fc4' },
  { key: 'on_hold', label: 'On hold', color: '#8b6bb8' },
] as const;

/**
 * The manager's dashboard: the operation right now and over the last seven
 * days, at a glance. An overview, not a worklist; the period analysis is on
 * Reports. Every figure comes from `/analytics/dashboard/`.
 */
export default function ManagerDashboard() {
  const { data, loading, error } = useManagerDashboard();

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Every campus. Open and overdue are right now; the rest is the last seven days, against the seven before.
      </p>
      {error ? (
        <Card className="p-6 text-center text-sm text-destructive">The dashboard could not be loaded.</Card>
      ) : (
        <>
          <MetricCardRow stats={cards(data)} loading={loading} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <TicketVolumeChart
              title="Raised and resolved, day by day"
              settledLabel="Resolved"
              bucket="day"
              barSize={8}
              height={240}
              loading={loading}
              trend={data?.days.map((d) => ({ bucket: d.day, total: d.raised, settled: d.resolved })) ?? null}
            />
            <OpenByCampus data={data} />
          </div>
          <CampusTable
            rows={data?.campus_table ?? null}
            target={data?.target_pct}
            description="The last seven days. Open, overdue and with HOD are right now."
          />
        </>
      )}
    </div>
  );
}

function cards(data: DashboardEnvelope | null): StatConfig[] {
  const live = data?.live;
  const now = data?.this_week;
  const before = data?.last_week;
  const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);
  return [
    {
      id: 'open', title: 'Open now', value: live?.open_now ?? 0,
      description: `${live?.waiting ?? 0} waiting · ${live?.on_hold ?? 0} held`,
      icon: <Inbox className="h-5 w-5 text-blue-600" />, iconBgColor: 'bg-blue-100',
    },
    {
      id: 'overdue', title: 'Overdue now', value: live?.overdue ?? 0,
      description: `${live?.at_hod ?? 0} with the HOD`,
      icon: <AlertTriangle className="h-5 w-5 text-red-700" />, iconBgColor: 'bg-red-100',
    },
    {
      id: 'raised', title: 'Raised this week', value: now?.total ?? 0,
      description: `${before?.total ?? 0} last week`,
      icon: <FileText className="h-5 w-5 text-blue-600" />, iconBgColor: 'bg-blue-100',
    },
    {
      id: 'on-time', title: 'Resolved on time', value: pct(now?.resolution_sla_pct),
      description: `${pct(before?.resolution_sla_pct)} last week`,
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-700" />, iconBgColor: 'bg-emerald-100',
    },
    {
      id: 'fix', title: 'Time to fix', value: formatSeconds(now?.resolution_seconds_avg ?? null),
      description: `${formatSeconds(before?.resolution_seconds_avg ?? null)} last week`,
      icon: <Hourglass className="h-5 w-5 text-violet-600" />, iconBgColor: 'bg-violet-100',
    },
    {
      id: 'rating', title: 'Rating', value: now?.rating_avg == null ? '—' : `${now.rating_avg} / 5`,
      description: `${now?.rating_count ?? 0} ratings this week`,
      icon: <Star className="h-5 w-5 text-amber-500" />, iconBgColor: 'bg-amber-50',
    },
  ];
}

function OpenByCampus({ data }: { data: DashboardEnvelope | null }) {
  const rows = data?.campuses ?? null;
  const most = Math.max(1, ...(rows ?? []).map((r) => r.open_now));
  return (
    <Card aria-label="Open work by campus" className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Open work by campus</CardTitle>
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
          // Rows share the card's height, so the chart fills it beside the day-by-day chart.
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
