import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Hourglass, Inbox, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MetricCardRow, type StatConfig } from '@/components/shared/data/MetricCard';
import { TicketVolumeChart } from '@/components/shared/data/TicketVolumeChart';
import CampusTable from '@/components/shared/data/CampusTable';
import HoldsPanel from '@/components/shared/data/HoldsPanel';
import RangeSelector from '@/components/shared/data/RangeSelector';
import ReportDownloads from '@/components/shared/data/ReportDownloads';
import { useOverview } from '@/hooks/useAnalytics';
import { useCampuses } from '@/hooks/useOrganizations';
import { RANGES, type RangeKey } from '@/constants/analytics';
import { FALLBACK_TRADE_THEME, TRADE_THEMES } from '@/constants/catalogue';
import type { OverviewEnvelope, OverviewInsight } from '@/types';
import { formatSeconds } from '@/utils/date';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<OverviewInsight['kind'], { text: string; tone: string }> = {
  campus: { text: 'Campus', tone: 'bg-red-50 text-red-800' },
  trade: { text: 'Trade', tone: 'bg-amber-50 text-amber-800' },
  staffing: { text: 'Staffing', tone: 'bg-amber-50 text-amber-800' },
  facility: { text: 'Facility', tone: 'bg-blue-50 text-blue-800' },
  escalated: { text: 'Escalated', tone: 'bg-red-50 text-red-800' },
};

const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

/**
 * The manager's report: how the period went against the one before, what
 * needs attention, which buildings keep breaking, then campuses and trades.
 * Every section comes from `/analytics/overview/`, so the campus picker
 * narrows all of them at once.
 */
export default function ManagerReportsPage() {
  const [range, setRange] = useState<RangeKey>('month');
  const [campus, setCampus] = useState<number | null>(null);
  const { days, bucket } = RANGES[range];
  const { campuses } = useCampuses();
  const { data, loading, error } = useOverview({ days, bucket, ...(campus ? { campus } : {}) });

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data?.campus ? data.campus.name : 'Every campus'}, against the period before
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={campus ? String(campus) : 'all'} onValueChange={(v) => setCampus(v === 'all' ? null : Number(v))}>
            <SelectTrigger className="h-9 w-44" aria-label="Campus">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campuses</SelectItem>
              {campuses.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RangeSelector value={range} onChange={setRange} />
          {/* The files cover every campus; they are offered only when the page does too. */}
          {!campus && <ReportDownloads role="manager" params={{ days, bucket }} />}
        </div>
      </div>

      {error ? (
        <Card className="p-6 text-center text-sm text-destructive">The report could not be loaded.</Card>
      ) : (
        <>
          <MetricCardRow stats={headline(data)} loading={loading} />
          <Attention insights={data?.insights ?? null} />
          <FacilityHealth data={data} />
          <CampusTable
            rows={data?.campuses ?? null}
            target={data?.target_pct}
            onPick={setCampus}
            description={<>Pick a campus to read this page for it alone.{data?.target_pct != null && ` Target: ${data.target_pct}% on time.`}</>}
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Trades data={data} />
            <TradesByCampus data={data} />
          </div>
          <TicketVolumeChart trend={data?.trend ?? null} loading={loading} bucket={bucket} height={300} title="Tickets raised" barSize={8} />
          <HoldsPanel bottlenecks={data?.bottlenecks ?? null} loading={loading} />
        </>
      )}
    </div>
  );
}

/** The five headline cards, each against the period before where that means something. */
function headline(data: OverviewEnvelope | null): StatConfig[] {
  const c = data?.current;
  const p = data?.previous;
  return [
    {
      id: 'on-time', title: 'Resolved on time', value: pct(c?.resolution_sla_pct ?? null),
      description: p?.resolution_sla_pct != null ? `${p.resolution_sla_pct}% the period before` : 'Settled work, by its deadline',
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-700" />, iconBgColor: 'bg-emerald-100',
    },
    {
      id: 'fix', title: 'Average time to fix', value: formatSeconds(c?.resolution_seconds_avg ?? null),
      description: p?.resolution_seconds_avg != null ? `${formatSeconds(p.resolution_seconds_avg)} the period before` : 'Holds left out',
      icon: <Hourglass className="h-5 w-5 text-violet-600" />, iconBgColor: 'bg-violet-100',
    },
    {
      id: 'overdue', title: 'Overdue now', value: c?.overdue ?? 0,
      description: `${data?.at_hod_now ?? 0} live jobs sit with the HOD`,
      icon: <AlertTriangle className="h-5 w-5 text-red-700" />, iconBgColor: 'bg-red-100',
    },
    {
      id: 'open', title: 'Open right now', value: c?.open_backlog ?? 0,
      description: `${data?.unassigned_now ?? 0} waiting for a technician`,
      icon: <Inbox className="h-5 w-5 text-blue-600" />, iconBgColor: 'bg-blue-100',
    },
    {
      id: 'rating', title: 'Rating', value: c?.rating_avg == null ? '—' : `${c.rating_avg} / 5`,
      description: `${c?.rating_count ?? 0} ratings`,
      icon: <Star className="h-5 w-5 text-amber-500" />, iconBgColor: 'bg-amber-50',
    },
  ];
}

function Attention({ insights }: { insights: OverviewInsight[] | null }) {
  return (
    <Card aria-label="Needs your attention">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Needs your attention</CardTitle>
      </CardHeader>
      <CardContent>
        {insights == null ? (
          <Skeleton className="h-28 w-full" />
        ) : insights.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing is below target this period.</p>
        ) : (
          <ul className="divide-y">
            {insights.map((item) => (
              <li key={`${item.kind}:${item.text}`} className="flex items-baseline gap-3 py-2.5 text-sm">
                <span className={cn('w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold', KIND_LABEL[item.kind].tone)}>
                  {KIND_LABEL[item.kind].text}
                </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FacilityHealth({ data }: { data: OverviewEnvelope | null }) {
  const rows = data?.facilities ?? null;
  const most = Math.max(1, ...(rows ?? []).map((r) => r.total));
  return (
    <Card aria-label="Facility Health">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Facility Health</CardTitle>
        <CardDescription>Buildings where faults keep coming back this period, and in which trade.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows == null ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No building shows a pattern this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="p-2 font-medium">Building</th>
                  <th className="p-2 text-right font-medium">Faults</th>
                  <th className="w-[28%] p-2 font-medium">By trade</th>
                  <th className="p-2 font-medium">Keeps coming back</th>
                  <th className="p-2 font-medium">Suggests</th>
                  <th className="p-2 text-right font-medium">Open</th>
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
                    <td className="p-2">
                      {row.repeats.length
                        ? row.repeats.map((r) => `${r.label} ${r.total}×`).join(', ')
                        : <span className="text-muted-foreground">{row.resolution_seconds_avg ? `Avg fix ${formatSeconds(row.resolution_seconds_avg)}` : '—'}</span>}
                    </td>
                    <td className="p-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', row.flag === 'act' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800')}>
                        {row.suggestion}
                      </span>
                    </td>
                    <td className="p-2 text-right">{row.open_now}</td>
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

function Trades({ data }: { data: OverviewEnvelope | null }) {
  const rows = data?.trades ?? null;
  return (
    <Card aria-label="Trades" className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Trades</CardTitle>
      </CardHeader>
      <CardContent>
        {rows == null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-right text-sm text-muted-foreground">
                <th className="p-2 text-left font-medium">Trade</th>
                <th className="p-2 font-medium">Raised</th>
                <th className="p-2 font-medium">On time</th>
                <th className="p-2 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="text-right">
              {rows.map((row) => (
                <tr key={row.key} className="border-t">
                  <th scope="row" className="p-2 text-left font-medium">{row.label}</th>
                  <td className="p-2">{row.total}</td>
                  <td className="p-2">{pct(row.resolution_sla_pct)}</td>
                  <td className="p-2">{row.rating_avg ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function TradesByCampus({ data }: { data: OverviewEnvelope | null }) {
  const grid = data?.trade_by_campus ?? null;
  return (
    <Card aria-label="Trades by campus" className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Trades by campus</CardTitle>
        <CardDescription>Tickets raised in each trade at each campus.</CardDescription>
      </CardHeader>
      <CardContent>
        {grid == null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-right text-sm text-muted-foreground">
                  <th className="p-2 text-left font-medium">Campus</th>
                  {grid.trades.map((t) => <th key={t} className="p-2 font-medium">{t}</th>)}
                  <th className="p-2 font-medium">All</th>
                </tr>
              </thead>
              <tbody className="text-right">
                {grid.rows.map((row) => (
                  <tr key={row.campus} className="border-t">
                    <th scope="row" className="p-2 text-left font-medium">{row.campus}</th>
                    {grid.trades.map((t) => <td key={t} className="p-2">{row.counts[t] ?? 0}</td>)}
                    <td className="p-2 font-semibold">{row.total}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <th scope="row" className="p-2 text-left">All</th>
                  {grid.trades.map((t) => <td key={t} className="p-2">{grid.totals[t]}</td>)}
                  <td className="p-2">{grid.total}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
