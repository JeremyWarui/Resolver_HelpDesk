import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportHeadline from '@/components/shared/data/ReportHeadline';
import TechnicianTable from '@/components/shared/data/TechnicianTable';
import { TicketVolumeChart } from '@/components/shared/data/TicketVolumeChart';
import CampusTable from '@/components/shared/data/CampusTable';
import HoldsPanel from '@/components/shared/data/HoldsPanel';
import RangeSelector from '@/components/shared/data/RangeSelector';
import ReportDownloads from '@/components/shared/data/ReportDownloads';
import FacilityPatternTable from '@/components/shared/data/FacilityPatternTable';
import { useOverview } from '@/hooks/useAnalytics';
import { useCampuses } from '@/hooks/useOrganizations';
import { RANGES, type RangeKey } from '@/constants/analytics';
import type { OverviewEnvelope, OverviewInsight } from '@/types';
import { belowTarget, formatPct as pct } from '@/utils/format';
import { EVERY_CAMPUS_ROLES, SCOPE_SUBTITLE } from '@/constants/roles';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<OverviewInsight['kind'], { text: string; tone: string }> = {
  campus: { text: 'Campus', tone: 'bg-red-50 text-red-800' },
  trade: { text: 'Trade', tone: 'bg-amber-50 text-amber-800' },
  technician: { text: 'Technician', tone: 'bg-violet-50 text-violet-800' },
  staffing: { text: 'Staffing', tone: 'bg-amber-50 text-amber-800' },
  facility: { text: 'Facility', tone: 'bg-blue-50 text-blue-800' },
  escalated: { text: 'Escalated', tone: 'bg-red-50 text-red-800' },
};

/**
 * The Reports page of the manager, the HOD and the HOS: how the period went
 * against the one before, what needs attention, which buildings keep
 * breaking, then the manager's campuses and trades or a supervisor's
 * technicians and trades. Every section comes from `/analytics/overview/`, so
 * the manager's campus picker narrows all of them at once.
 */
export default function OverviewReportsPage({ role }: { role: 'admin' | 'manager' | 'hod' | 'hos' }) {
  const everyCampus = EVERY_CAMPUS_ROLES.includes(role);
  const [range, setRange] = useState<RangeKey>('month');
  const [campus, setCampus] = useState<number | null>(null);
  const { days, bucket } = RANGES[range];
  const { campuses } = useCampuses({ enabled: everyCampus });
  const { data, loading, error } = useOverview({ days, bucket, ...(campus ? { campus } : {}) });

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data?.campus ? data.campus.name : SCOPE_SUBTITLE[role]}, against the period before
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {everyCampus && (
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
          )}
          <RangeSelector value={range} onChange={setRange} />
          <ReportDownloads role={role} params={{ days, bucket, campus: campus ?? undefined }} />
        </div>
      </div>

      {error ? (
        <Card className="p-6 text-center text-sm text-destructive">The report could not be loaded.</Card>
      ) : (
        <>
          <ReportHeadline current={data?.current} previous={data?.previous} holds={data?.bottlenecks} loading={loading} />
          <Attention insights={data?.insights ?? null} />
          <TicketVolumeChart trend={data?.trend ?? null} loading={loading} bucket={bucket} height={300} title="Tickets raised" barSize={8} />
          <FacilityHealth data={data} />
          {everyCampus ? (
            <>
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
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <TechnicianTable rows={data?.technicians ?? null} target={data?.target_pct} variant="period" />
              <Trades data={data} />
            </div>
          )}
          <HoldsPanel bottlenecks={data?.bottlenecks ?? null} loading={loading} />
        </>
      )}
    </div>
  );
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
          // Laid out as a job card's details: a bordered box, ruled inside, no header row.
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <tbody>
                {insights.map((item) => (
                  <tr key={`${item.kind}:${item.text}`} className="border-t border-gray-100 first:border-t-0">
                    <th scope="row" className={cn('w-28 border-r border-gray-100 px-4 py-2.5 text-left align-top font-semibold', KIND_LABEL[item.kind].tone)}>
                      {KIND_LABEL[item.kind].text}
                    </th>
                    <td className="px-4 py-2.5 text-gray-900">{item.text}</td>
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

function FacilityHealth({ data }: { data: OverviewEnvelope | null }) {
  const rows = data?.facilities ?? null;
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
          <FacilityPatternTable rows={rows} detail />
        )}
      </CardContent>
    </Card>
  );
}

function Trades({ data }: { data: OverviewEnvelope | null }) {
  const rows = data?.trades ?? null;
  const target = data?.target_pct;
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
                <th className="p-2 font-medium">Resolved on time</th>
                <th className="p-2 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="text-right">
              {rows.map((row) => (
                <tr key={row.key} className="border-t">
                  <th scope="row" className="p-2 text-left font-medium">{row.label}</th>
                  <td className="p-2">{row.total}</td>
                  <td className={cn('p-2 font-semibold', belowTarget(row.resolution_sla_pct, target) && 'text-red-700')}>
                    {pct(row.resolution_sla_pct)}
                  </td>
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
