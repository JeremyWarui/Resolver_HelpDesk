import { useState } from 'react';
import TicketStatsCards from '@/components/shared/data/TicketStatsCards';
import ChartsSection from '@/features/shared/ChartsSection';
import RecentTicketsTable from '@/features/shared/RecentTickets';
import LazyMount from '@/components/shared/LazyMount';
import { useAnalytics } from '@/hooks/useAnalytics';
import { RANGES, type RangeKey } from '@/constants/analytics';
import { SCOPE_SUBTITLE } from '@/constants/roles';

type DashboardRole = 'admin' | 'manager' | 'hod' | 'hos';

interface Props {
  role: DashboardRole;
  onTicketSelect?: (id: number) => void;
}

/**
 * The dashboard homepage for a supervising role: where the work stands now and
 * what came in lately. The cuts by trade, facility and technician are on the
 * reports page.
 */
export default function RoleDashboardView({ role, onTicketSelect }: Props) {
  const [trendRange, setTrendRange] = useState<RangeKey>('week');
  const [statusRange, setStatusRange] = useState<RangeKey>('week');

  const trendParams = { days: RANGES[trendRange].days, bucket: RANGES[trendRange].bucket };
  const { data: trendData, loading: trendLoading } = useAnalytics(trendParams);
  const { data: statusData, loading: statusLoading } = useAnalytics({
    days: RANGES[statusRange].days,
    group_by: 'status',
  });

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-gray-50">
      <p className="text-sm text-muted-foreground mb-2">{SCOPE_SUBTITLE[role]}</p>

      <TicketStatsCards params={trendParams} />

      <ChartsSection
        trend={trendData?.trend ?? null}
        trendLoading={trendLoading}
        byStatus={statusData?.breakdown ?? null}
        statusLoading={statusLoading}
        trendRange={trendRange}
        setTrendRange={setTrendRange}
        statusRange={statusRange}
        setStatusRange={setStatusRange}
      />

      {/* The manager passes no `onTicketSelect`: their rows do not open. */}
      <LazyMount minHeight={400}>
        <RecentTicketsTable onTicketSelect={onTicketSelect} />
      </LazyMount>
    </div>
  );
}
