// SLATrackingView — SLA-focused ticket tracking for section heads and HODs.
// Classifies all in-scope tickets into breached / at_risk / on_track client-side.
// Breached rows always sort to top (pre-sort before passing to TicketTable).
// Auto-refreshes every 60 seconds via setInterval on the refetch callback.
// Section selector is shown for hod role only (HOS has a single section scope).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { useRoleContext } from '@/lib/auth/roleContext';
import useTickets from '@/hooks/tickets/useTickets';
import { useSections } from '@/hooks/sections/useSections';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { SLAComplianceGauge } from '@/components/shared/data/SLAComplianceGauge';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { FilterPill, Ticket } from '@/types';

const AT_RISK_MS = 24 * 60 * 60 * 1000;

type SlaFilter = 'all' | 'breached' | 'at_risk' | 'on_track';
type SlaState  = 'breached' | 'at_risk' | 'on_track' | 'no_sla';

function slaState(ticket: Ticket): SlaState {
  if (!ticket.resolution_due_at) return 'no_sla';
  if (ticket.paused_at) return 'on_track'; // SLA frozen while pending (R9)
  const remaining = new Date(ticket.resolution_due_at).getTime() - Date.now();
  if (remaining <= 0) return 'breached';
  if (remaining < AT_RISK_MS) return 'at_risk';
  return 'on_track';
}

const SLA_ORDER: Record<SlaState, number> = {
  breached: 0,
  at_risk:  1,
  on_track: 2,
  no_sla:   3,
};

function sortBySla(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => {
    const ao = SLA_ORDER[slaState(a)];
    const bo = SLA_ORDER[slaState(b)];
    if (ao !== bo) return ao - bo;
    const ad = a.resolution_due_at ? new Date(a.resolution_due_at).getTime() : Infinity;
    const bd = b.resolution_due_at ? new Date(b.resolution_due_at).getTime() : Infinity;
    return ad - bd;
  });
}

function breachClass(ticket: Ticket): string {
  if (ticket.resolution_due_at && !ticket.paused_at && new Date(ticket.resolution_due_at).getTime() < Date.now()) {
    return 'border-l-2 border-status-escalated bg-status-escalated/5';
  }
  return '';
}

interface SLATrackingViewProps { onTicketSelect?: (id: number) => void; }

export function SLATrackingView({ onTicketSelect }: SLATrackingViewProps) {
  const { role } = useRoleContext();
  const isHod = role === 'hod';

  const [slaFilter, setSlaFilter]   = useState<SlaFilter>('all');
  const [sectionId, setSectionId]   = useState<number | null>(null);

  const { sections } = useSections();

  const ticketParams = useMemo(() => ({ page_size: 100 }), []);

  const { tickets, totalTickets, loading, refetch } = useTickets(ticketParams);

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(refetch, 60_000);
    return () => clearInterval(id);
  }, [refetch]);

  const sorted = useMemo(() => sortBySla(tickets), [tickets]);

  const counts = useMemo(() => {
    let breached = 0, at_risk = 0, on_track = 0;
    for (const t of sorted) {
      const s = slaState(t);
      if (s === 'breached') breached++;
      else if (s === 'at_risk') at_risk++;
      else if (s === 'on_track') on_track++;
    }
    return { breached, at_risk, on_track };
  }, [sorted]);

  const pills = useMemo((): FilterPill[] => [
    { key: 'all',      label: 'All',      count: sorted.length },
    { key: 'breached', label: 'Breached', count: counts.breached, variant: 'danger'  },
    { key: 'at_risk',  label: 'At Risk',  count: counts.at_risk,  variant: 'warning' },
    { key: 'on_track', label: 'On Track', count: counts.on_track, variant: 'success' },
  ], [sorted.length, counts]);

  const visibleTickets = useMemo(() => {
    if (slaFilter === 'all') return sorted;
    return sorted.filter((t) => {
      const s = slaState(t);
      if (slaFilter === 'breached') return s === 'breached';
      if (slaFilter === 'at_risk')  return s === 'at_risk';
      if (slaFilter === 'on_track') return s === 'on_track' || s === 'no_sla';
      return true;
    });
  }, [sorted, slaFilter]);

  const compliance = useMemo(() => {
    const withDue = sorted.filter((t) => t.resolution_due_at);
    if (!withDue.length) return 100;
    const ok = withDue.filter((t) => slaState(t) !== 'breached').length;
    return Math.round((ok / withDue.length) * 100);
  }, [sorted]);

  const handleRowClick = useCallback((ticket: Ticket) => {
    onTicketSelect?.(ticket.id);
  }, []);

  const handleRefresh = useCallback(() => refetch(), [refetch]);

  const subtitle = loading
    ? 'Loading…'
    : totalTickets > 100
      ? `Showing 100 of ${totalTickets} tracked tickets`
      : `${sorted.length} active ticket${sorted.length !== 1 ? 's' : ''} tracked`;

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-background space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {isHod && sections.length > 0 && (
            <Select
              value={sectionId ? String(sectionId) : 'all'}
              onValueChange={(v) => setSectionId(v === 'all' ? null : Number(v))}
            >
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center py-4">
          <CardContent className="p-0">
            <SLAComplianceGauge value={compliance} loading={loading} size={100} />
          </CardContent>
        </Card>
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          label="Breached"
          value={counts.breached}
          loading={loading}
          colorClass="bg-red-50 border-red-200"
        />
        <KpiCard
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          label="At Risk (<24h)"
          value={counts.at_risk}
          loading={loading}
          colorClass="bg-amber-50 border-amber-200"
        />
        <KpiCard
          icon={<CheckCircle className="h-5 w-5 text-green-600" />}
          label="On Track"
          value={counts.on_track}
          loading={loading}
          colorClass="bg-green-50 border-green-200"
        />
      </div>

      {/* Filter pills */}
      <FilterPills
        pills={pills}
        active={slaFilter}
        onChange={(k) => setSlaFilter(k as SlaFilter)}
        loading={loading}
        className="justify-end"
      />

      {/* Ticket table — sla variant shows SLACountdown column */}
      <TicketTable
        tickets={visibleTickets}
        variant="sla"
        loading={loading}
        onRowClick={handleRowClick}
        rowClassName={breachClass}
        emptyMessage={
          slaFilter === 'breached' ? 'No breached tickets'
          : slaFilter === 'at_risk' ? 'No at-risk tickets'
          : 'No tickets found'
        }
        emptyDescription={
          slaFilter === 'all'
            ? 'No active tickets are tracked for SLA'
            : 'All tracked tickets are within SLA targets'
        }
      />

    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  loading,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  colorClass: string;
}) {
  return (
    <Card className={`border ${colorClass}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="shrink-0">{icon}</div>
        <div>
          {loading ? (
            <Skeleton className="h-7 w-12 mb-1" />
          ) : (
            <p className="text-2xl font-bold">{value}</p>
          )}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
