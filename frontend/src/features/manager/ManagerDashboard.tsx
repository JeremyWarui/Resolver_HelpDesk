import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Hourglass, Inbox, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import CampusTable from '@/components/shared/data/CampusTable';
import { MetricCardRow, type StatConfig } from '@/components/shared/data/MetricCard';
import { TicketVolumeChart } from '@/components/shared/data/TicketVolumeChart';
import { useManagerDashboard } from '@/hooks/useAnalytics';
import { FALLBACK_TRADE_THEME, TRADE_THEMES } from '@/constants/catalogue';
import type { DashboardEnvelope, DashboardPeriod } from '@/types';
import { formatSeconds } from '@/utils/date';

/** The three stages of live work, in the order a job moves through them. */
const STAGES = [
  { key: 'waiting', label: 'Waiting', color: '#e0973f' },
  { key: 'with_technician', label: 'With a technician', color: '#1d5fc4' },
  { key: 'on_hold', label: 'On hold', color: '#8b6bb8' },
] as const;

const PERIODS = [7, 30, 90] as const;
const PERIOD_LABEL: Record<DashboardPeriod, string> = { 7: 'This week', 30: 'This month', 90: 'This quarter' };
const RAISED_IN: Record<DashboardPeriod, string> = { 7: 'Raised this week', 30: 'Raised this month', 90: 'Raised this quarter' };

/**
 * The manager's dashboard: the operation right now and over the last seven
 * days, at a glance. An overview, not a worklist; the period analysis is on
 * Reports. Every figure comes from `/analytics/dashboard/`.
 */
export default function ManagerDashboard({ onSeeMore }: { onSeeMore: () => void }) {
  const [trendDays, setTrendDays] = useState<DashboardPeriod>(7);
  const [openDays, setOpenDays] = useState<DashboardPeriod | null>(null);
  const { data, loading, error } = useManagerDashboard({ trend_days: trendDays, open_days: openDays });
  const trend = data?.trend;

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
              title={trend?.bucket === 'week' ? 'Raised and resolved, week by week' : 'Raised and resolved, day by day'}
              settledLabel="Resolved"
              bucket={trend?.bucket ?? 'day'}
              barSize={trendDays === 30 ? 5 : 8}
              height={240}
              loading={loading}
              trend={trend?.rows.map((r) => ({ bucket: r.start, total: r.raised, settled: r.resolved })) ?? null}
              action={
                <PeriodPicker
                  label="Raised and resolved period"
                  value={String(trendDays)}
                  onChange={(v) => setTrendDays(Number(v) as DashboardPeriod)}
                  options={PERIODS.map((d) => ({ value: String(d), label: PERIOD_LABEL[d] }))}
                />
              }
            />
            <OpenByCampus
              data={data}
              picker={
                <PeriodPicker
                  label="Open work period"
                  value={openDays == null ? 'all' : String(openDays)}
                  onChange={(v) => setOpenDays(v === 'all' ? null : (Number(v) as DashboardPeriod))}
                  options={[
                    { value: 'all', label: 'All open work' },
                    ...PERIODS.map((d) => ({ value: String(d), label: RAISED_IN[d] })),
                  ]}
                />
              }
            />
          </div>
          <CampusTable
            rows={data?.campus_table ?? null}
            target={data?.target_pct}
            description="The last seven days. Open, overdue and with HOD are right now."
          />
          <FacilityHealth data={data} onSeeMore={onSeeMore} />
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

function PeriodPicker({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto gap-2 text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OpenByCampus({ data, picker }: { data: DashboardEnvelope | null; picker: ReactNode }) {
  const rows = data?.campuses ?? null;
  const most = Math.max(1, ...(rows ?? []).map((r) => r.open_now));
  return (
    <Card aria-label="Open work by campus" className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Open work by campus</CardTitle>
          {picker}
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
          // Rows share the card's height, so the chart fills it beside the raised-and-resolved chart.
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

/** The Reports page's Facility Health, cut to the building, its faults and their trades. */
function FacilityHealth({ data, onSeeMore }: { data: DashboardEnvelope | null; onSeeMore: () => void }) {
  const rows = data?.facilities ?? null;
  const most = Math.max(1, ...(rows ?? []).map((r) => r.total));
  return (
    <Card aria-label="Facility Health">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Facility Health</CardTitle>
          <CardDescription>Buildings where faults keep coming back this week, and in which trade.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onSeeMore}>See more in Reports</Button>
      </CardHeader>
      <CardContent>
        {rows == null ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No building shows a pattern this week.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="p-2 font-medium">Building</th>
                  <th className="p-2 text-right font-medium">Faults reported</th>
                  <th className="w-1/2 p-2 font-medium">By trade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t align-top">
                    <th scope="row" className="p-2 text-left font-medium">
                      {row.label}
                      <div className="text-xs font-normal text-muted-foreground">{row.campus} · {row.type}</div>
                    </th>
                    <td className="p-2 text-right font-semibold">{row.total}</td>
                    <td className="p-2">
                      <div className="flex h-3 overflow-hidden rounded" style={{ width: `${(row.total / most) * 100}%` }} aria-hidden>
                        {row.trades.map((t) => (
                          <span key={t.label} style={{ width: `${(t.total / row.total) * 100}%`, background: (TRADE_THEMES[t.code ?? ''] ?? FALLBACK_TRADE_THEME).color }} />
                        ))}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.trades.map((t) => `${t.label} ${t.total}`).join(' · ')}
                      </div>
                    </td>
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
