import { CheckCheck, CheckCircle2, ClipboardList, Hourglass, PauseCircle, Star } from 'lucide-react';
import { MetricCardRow } from '@/components/shared/data/MetricCard';
import type { Bottleneck, PeriodBefore, Totals } from '@/types';
import { formatSeconds } from '@/utils/date';
import { formatPct as pct } from '@/utils/format';

/** A Reports page's six headline cards, each beside the period before where that means something. */
export default function ReportHeadline({ current, previous, holds, loading }: {
  current: Totals | undefined;
  previous: PeriodBefore | undefined;
  /** What is on hold now, by reason: the card is their sum, so it agrees with the On Hold panel. */
  holds: Bottleneck[] | undefined;
  loading: boolean;
}) {
  const c = current;
  const p = previous;
  return (
    <MetricCardRow
      loading={loading}
      wrapDescriptions
      stats={[
        {
          id: 'raised', title: 'Raised', value: c?.total ?? 0,
          description: p ? `${p.total} the period before` : 'Tickets raised in the period',
          icon: <ClipboardList className="h-5 w-5 text-blue-600" />, iconBgColor: 'bg-blue-100',
        },
        {
          id: 'resolved', title: 'Resolved', value: c?.settled ?? 0,
          description: p ? `${p.settled} the period before` : 'Of the tickets raised in the period',
          icon: <CheckCheck className="h-5 w-5 text-emerald-700" />, iconBgColor: 'bg-emerald-100',
        },
        {
          id: 'on-hold', title: 'On hold now', value: (holds ?? []).reduce((sum, row) => sum + row.total, 0),
          description: 'Paused right now',
          icon: <PauseCircle className="h-5 w-5 text-purple-700" />, iconBgColor: 'bg-purple-100',
        },
        {
          id: 'on-time', title: 'Resolved on time', value: pct(c?.resolution_sla_pct ?? null),
          description: p?.resolution_sla_pct != null ? `${p.resolution_sla_pct}% the period before` : 'Settled work, by its deadline',
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-700" />, iconBgColor: 'bg-emerald-100',
        },
        {
          id: 'resolve', title: 'Time to resolve', value: formatSeconds(c?.resolution_seconds_avg ?? null),
          description: p?.resolution_seconds_avg != null ? `${formatSeconds(p.resolution_seconds_avg)} the period before` : 'Holds left out',
          icon: <Hourglass className="h-5 w-5 text-violet-600" />, iconBgColor: 'bg-violet-100',
        },
        {
          id: 'rating', title: 'Rating', value: c?.rating_avg == null ? '—' : `${c.rating_avg} / 5`,
          description: `${c?.rating_count ?? 0} ratings`,
          icon: <Star className="h-5 w-5 text-amber-500" />, iconBgColor: 'bg-amber-50',
        },
      ]}
    />
  );
}
