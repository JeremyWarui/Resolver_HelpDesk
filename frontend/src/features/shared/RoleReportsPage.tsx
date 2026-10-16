import { useState } from 'react';
import TicketStatsCards from '@/components/shared/data/TicketStatsCards';
import { TicketVolumeChart } from '@/components/shared/data/TicketVolumeChart';
import BreakdownChart from '@/components/shared/data/BreakdownChart';
import BreakdownTable from '@/components/shared/data/BreakdownTable';
import ServiceHealthCards from '@/components/shared/data/ServiceHealthCards';
import FacilityHealthTable from '@/components/shared/data/FacilityHealthTable';
import HoldsPanel from '@/components/shared/data/HoldsPanel';
import RangeSelector from '@/components/shared/data/RangeSelector';
import ReportDownloads from '@/components/shared/data/ReportDownloads';
import LazyMount from '@/components/shared/LazyMount';
import { useAnalytics } from '@/hooks/useAnalytics';
import { RANGES, type RangeKey } from '@/constants/analytics';
import { SCOPE_SUBTITLE } from '@/constants/roles';

/**
 * The admin's reporting page. Every figure comes from `/analytics/`,
 * scoped server-side. A breakdown is offered only where `role_config.py` would
 * serve it — asking for one it refuses returns the role's default instead, so
 * the table would be titled the wrong thing.
 */
export default function RoleReportsPage({ role }: { role: 'admin' }) {
  const [range, setRange] = useState<RangeKey>('month');
  const { days, bucket } = RANGES[range];
  const params = { days, bucket };

  const { data, loading } = useAnalytics(params);

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{SCOPE_SUBTITLE[role]}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ReportDownloads role={role} params={params} />
          <RangeSelector value={range} onChange={setRange} />
        </div>
      </div>

      <TicketStatsCards params={params} />
      <ServiceHealthCards params={params} />

      <TicketVolumeChart
        trend={data?.trend ?? null}
        loading={loading}
        bucket={bucket}
        height={340}
        title="Tickets Raised"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownChart
          dimension="status"
          kind="pie"
          title="Status"
          description="Where this period's tickets stand"
          params={params}
          height={340}
        />
        <BreakdownChart
          dimension="trade"
          kind="pie"
          title="Trade"
          description="Which craft the work belongs to"
          params={params}
          height={340}
        />
      </div>

      <LazyMount minHeight={320}>
        <BreakdownTable
          dimension="campus"
          title="Campus Performance"
          description="Ticket load, speed and SLA per campus"
          params={params}
          columns={['total', 'open', 'settled', 'escalated', 'response_seconds_avg', 'resolution_seconds_avg', 'resolution_sla_pct', 'rating_avg']}
        />
      </LazyMount>

      <LazyMount minHeight={360}>
        <BreakdownTable
          dimension="technician"
          title="Technician Performance"
          description="Who is carrying the work"
          params={params}
          columns={['total', 'open', 'settled', 'missed', 'response_seconds_avg', 'resolution_seconds_avg', 'rating_avg']}
        />
      </LazyMount>

      <LazyMount minHeight={320}>
        <BreakdownTable
          dimension="trade"
          title="Trade Performance"
          description="Which craft is behind"
          params={params}
          columns={['total', 'open', 'settled', 'escalated', 'response_seconds_avg', 'resolution_seconds_avg', 'resolution_sla_pct', 'rating_avg']}
        />
      </LazyMount>

      {/* Every building on the register, joined to the work raised against it —
          so a building nobody has reported is a row, not an absence. */}
      <LazyMount minHeight={420}>
        <FacilityHealthTable params={params} />
      </LazyMount>

      <LazyMount minHeight={220}>
        <HoldsPanel bottlenecks={data?.bottlenecks ?? null} loading={loading} />
      </LazyMount>
    </div>
  );
}
