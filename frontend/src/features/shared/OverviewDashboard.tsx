import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Hourglass, Inbox, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import CampusTable from '@/components/shared/data/CampusTable';
import FacilityHealthSummary from '@/components/shared/data/FacilityHealthSummary';
import { MetricCardRow, type StatConfig } from '@/components/shared/data/MetricCard';
import OpenWorkBars from '@/components/shared/data/OpenWorkBars';
import PeriodPicker from '@/components/shared/data/PeriodPicker';
import TechnicianTable from '@/components/shared/data/TechnicianTable';
import { TicketVolumeChart } from '@/components/shared/data/TicketVolumeChart';
import WaitingList from '@/features/shared/WaitingList';
import { EVERY_CAMPUS_ROLES, SCOPE_SUBTITLE } from '@/constants/roles';
import { useDashboard } from '@/hooks/useAnalytics';
import type { DashboardEnvelope, DashboardPeriod } from '@/types';
import { formatSeconds } from '@/utils/date';
import { formatPct as pct } from '@/utils/format';

const PERIODS = [7, 30, 90] as const;
const PERIOD_LABEL: Record<DashboardPeriod, string> = { 7: 'This week', 30: 'This month', 90: 'This quarter' };
const RAISED_IN: Record<DashboardPeriod, string> = { 7: 'Raised this week', 30: 'Raised this month', 90: 'Raised this quarter' };

interface OverviewDashboardProps {
  role: 'manager' | 'hod' | 'hos';
  /** Moves to another section of the role's layout, by nav id. */
  onNavigate: (section: string) => void;
  onTicketSelect?: (id: number) => void;
}

/**
 * The dashboard of the manager, the HOD and the HOS: the operation right now
 * and over the last seven days, at a glance; Reports reads any other period.
 * Every figure comes from `/analytics/dashboard/`. The server decides what the
 * role reads: every campus and the Campuses table for the manager; open work
 * by trade, the tickets waiting for a technician and the technicians for an
 * HOS or HOD.
 */
export default function OverviewDashboard({ role, onNavigate, onTicketSelect }: OverviewDashboardProps) {
  const [trendDays, setTrendDays] = useState<DashboardPeriod>(7);
  const [openDays, setOpenDays] = useState<DashboardPeriod | null>(null);
  const { data, loading, error } = useDashboard({ trend_days: trendDays, open_days: openDays });
  const trend = data?.trend;
  const everyCampus = EVERY_CAMPUS_ROLES.includes(role);

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        {SCOPE_SUBTITLE[role]}. Open and overdue are right now; the rest is the last seven days, against the seven before.
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
            <OpenWorkBars
              title={`Open work by ${data?.open_by ?? (everyCampus ? 'campus' : 'trade')}`}
              rows={data?.open_work ?? null}
              action={
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
          {everyCampus ? (
            <CampusTable
              rows={data?.campus_table ?? null}
              target={data?.target_pct}
              description="The last seven days. Open, overdue and with HOD are right now."
            />
          ) : (
            <>
              <WaitingList
                waiting={data?.waiting ?? null}
                onTicketSelect={onTicketSelect}
                onSeeAll={() => onNavigate('tickets')}
              />
              <TechnicianTable rows={data?.technicians ?? null} target={data?.target_pct} variant="week" />
            </>
          )}
          <FacilityHealthSummary rows={data?.facilities ?? null} onSeeMore={() => onNavigate('reports')} />
        </>
      )}
    </div>
  );
}

function cards(data: DashboardEnvelope | null): StatConfig[] {
  const live = data?.live;
  const now = data?.this_week;
  const before = data?.last_week;
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
