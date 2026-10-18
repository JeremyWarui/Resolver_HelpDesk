import { useState } from 'react';
import { CheckCircle2, ClipboardList, Hourglass, ShieldCheck, Star, Wrench } from 'lucide-react';
import { MetricCardRow, type StatConfig } from '@/components/shared/data/MetricCard';
import { TicketVolumeChart } from '@/components/shared/data/TicketVolumeChart';
import BreakdownChart from '@/components/shared/data/BreakdownChart';
import HoldsPanel from '@/components/shared/data/HoldsPanel';
import RangeSelector from '@/components/shared/data/RangeSelector';
import ReportDownloads from '@/components/shared/data/ReportDownloads';
import { useAnalytics } from '@/hooks/useAnalytics';
import { RANGES, type RangeKey } from '@/constants/analytics';
import { SCOPE_SUBTITLE } from '@/constants/roles';
import { formatSeconds } from '@/utils/date';

/**
 * A technician's report on their own work: how many jobs, how fast, how many
 * on time, and how they were rated. The figures are the same `/analytics/`
 * ones every role reads, over the jobs assigned to them; the downloads print
 * the same headline (`summary_rows` in `analytics/export.py`).
 */
export default function TechnicianReportsPage() {
  const [range, setRange] = useState<RangeKey>('month');
  const { days, bucket } = RANGES[range];
  const params = { days, bucket };

  const { data, loading } = useAnalytics(params);
  // A trade pie for one trade is a whole circle; it is shown only when the period's
  // jobs span two or more. The query key matches the trade pie's own, so it is one request.
  const byTrade = useAnalytics({ ...params, group_by: 'trade' });
  const severalTrades = (byTrade.data?.breakdown.length ?? 0) > 1;
  // The grid's columns depend on the trade count, so it waits for it rather than reflowing.
  const chartsReady = !byTrade.loading;
  const t = data?.totals;

  const stats: StatConfig[] = [
    {
      id: 'assigned',
      title: 'Jobs assigned',
      value: t?.total ?? 0,
      description: 'Raised this period, and yours',
      icon: <ClipboardList className="h-5 w-5 text-blue-600" />,
      iconBgColor: 'bg-blue-100',
    },
    {
      id: 'active',
      title: 'Active now',
      value: t?.open_backlog ?? 0,
      description: 'Live jobs on your bench',
      icon: <Wrench className="h-5 w-5 text-amber-700" />,
      iconBgColor: 'bg-amber-100',
      ...(t?.overdue ? { badge: { value: `${t.overdue} late`, alert: true } } : {}),
    },
    {
      id: 'finished',
      title: 'Jobs finished',
      value: t?.settled ?? 0,
      description: 'Resolved or closed',
      icon: <CheckCircle2 className="h-5 w-5 text-status-resolved" />,
      iconBgColor: 'bg-status-resolved/10',
    },
    {
      id: 'time',
      title: 'Time to resolve',
      value: formatSeconds(t?.resolution_seconds_avg ?? null),
      description: 'Holds left out',
      icon: <Hourglass className="h-5 w-5 text-violet-600" />,
      iconBgColor: 'bg-violet-100',
    },
    {
      id: 'on-time',
      title: 'Resolved on time',
      value: t?.resolution_sla_pct == null ? '—' : `${t.resolution_sla_pct}%`,
      description: t ? `${t.missed} missed a deadline` : 'Finished by the deadline',
      icon: <ShieldCheck className="h-5 w-5 text-emerald-700" />,
      iconBgColor: 'bg-emerald-100',
    },
    {
      id: 'rating',
      title: 'My rating',
      value: t?.rating_avg == null ? '—' : `${t.rating_avg} / 5`,
      description: `${t?.rating_count ?? 0} rating${t?.rating_count === 1 ? '' : 's'}`,
      icon: <Star className="h-5 w-5 text-amber-500" />,
      iconBgColor: 'bg-amber-50',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{SCOPE_SUBTITLE.technician}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ReportDownloads role="technician" params={params} />
          <RangeSelector value={range} onChange={setRange} />
        </div>
      </div>

      <MetricCardRow stats={stats} loading={loading} />

      {/* The trend and its pies share a row on a wide screen. With two pies, a
          mid-width screen gives the trend its own row and the pies the next. */}
      {!chartsReady ? (
        <div className="h-[410px] rounded-xl border bg-card animate-pulse" aria-hidden />
      ) : (
        <div
          data-testid="report-charts"
          className={
            severalTrades
              ? 'grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)] lg:[&>:first-child]:col-span-2 xl:[&>:first-child]:col-span-1'
              : 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
          }
        >
          <TicketVolumeChart
            trend={data?.trend ?? null}
            loading={loading}
            bucket={bucket}
            height={300}
            title="Jobs raised and finished"
            settledLabel="Finished"
          />
          <BreakdownChart
            dimension="status"
            title="Where my jobs stand"
            description="Your jobs from this period, by status"
            params={params}
            height={300}
          />
          {severalTrades && (
            <BreakdownChart
              dimension="trade"
              title="By trade"
              description="Which of your trades the work was in"
              params={params}
              height={300}
            />
          )}
        </div>
      )}

      <HoldsPanel bottlenecks={data?.bottlenecks ?? null} loading={loading} />
    </div>
  );
}
