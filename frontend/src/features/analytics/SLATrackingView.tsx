// SLATrackingView — SLA-focused ticket tracking for section heads and HODs.
// Classifies in-scope tickets into overdue / at_risk / on_track / met / missed
// — see `slaState` for why settled tickets are judged differently from running
// ones. Overdue rows always sort to top (pre-sort before passing to TicketTable).
// Auto-refreshes every 60 seconds via setInterval on the refetch callback.
// Narrowing is by trade, not section: a HOD/HOS scope holds one section.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, CheckCheck, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import useTickets from '@/hooks/tickets/useTickets';
import { useTicketFilterOptions } from '@/hooks/tickets/useTicketFilterOptions';
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

type SlaFilter = 'all' | 'overdue' | 'at_risk' | 'on_track' | 'met' | 'missed';
type SlaState  = 'overdue' | 'at_risk' | 'on_track' | 'met' | 'missed' | 'no_sla';

const SETTLED: ReadonlySet<Ticket['status']> = new Set(['resolved', 'closed']);

/**
 * A ticket's SLA outcome.
 *
 * The distinction that matters is settled vs running. Once a ticket is
 * resolved its SLA outcome is fixed, and it is judged against `resolved_at` —
 * *not* against the clock. Comparing a finished ticket's due date to
 * `Date.now()` marks every ticket ever closed as breached the moment its due
 * date passes, however early it was actually resolved: a ticket resolved two
 * days inside target was being reported as a breach, and the compliance figure
 * fell a little further every day nobody touched the system.
 *
 * Hence two names for a miss rather than one. `overdue` is a live ticket past
 * its target — work to chase now, and exactly what `analytics.services` counts
 * as `breached` (it gates on `_q_running`). `missed` is a settled ticket that
 * finished late — history, not a queue. Collapsing them into one "Breached"
 * card left this page reporting 5 next to the Analytics page's 4.
 */
function slaState(ticket: Ticket): SlaState {
  if (!ticket.resolution_due_at) return 'no_sla';
  const due = new Date(ticket.resolution_due_at).getTime();

  if (SETTLED.has(ticket.status)) {
    const finished = ticket.resolved_at ?? ticket.closed_at;
    if (!finished) return 'no_sla';
    return new Date(finished).getTime() > due ? 'missed' : 'met';
  }

  if (ticket.paused_at) return 'on_track'; // SLA frozen while pending (R9)
  const remaining = due - Date.now();
  if (remaining <= 0) return 'overdue';
  if (remaining < AT_RISK_MS) return 'at_risk';
  return 'on_track';
}

const SLA_ORDER: Record<SlaState, number> = {
  overdue:  0,
  at_risk:  1,
  on_track: 2,
  missed:   3,
  met:      4,
  no_sla:   5,
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
  const state = slaState(ticket);
  if (state === 'overdue') return 'border-l-2 border-status-escalated bg-status-escalated/5';
  // A settled miss is history — worth marking, not worth alarming about.
  if (state === 'missed') return 'border-l-2 border-status-escalated/40';
  return '';
}

interface SLATrackingViewProps { onTicketSelect?: (id: number) => void; }

export function SLATrackingView({ onTicketSelect }: SLATrackingViewProps) {
  const [slaFilter, setSlaFilter]   = useState<SlaFilter>('all');
  const [tradeId, setTradeId]       = useState<number | null>(null);

  const { subSections } = useTicketFilterOptions();

  const ticketParams = useMemo(() => ({ page_size: 100 }), []);

  const { tickets, totalTickets, loading, refetch } = useTickets(ticketParams);

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(refetch, 60_000);
    return () => clearInterval(id);
  }, [refetch]);

  // The trade filter narrows everything downstream — counts, compliance and
  // table alike — so the pills always describe the set actually on screen.
  const sorted = useMemo(() => {
    const scoped = tradeId == null
      ? tickets
      : tickets.filter((t) => t.sub_section?.id === tradeId);
    return sortBySla(scoped);
  }, [tickets, tradeId]);

  const counts = useMemo(() => {
    let overdue = 0, at_risk = 0, on_track = 0, met = 0, missed = 0;
    for (const t of sorted) {
      const s = slaState(t);
      if (s === 'overdue') overdue++;
      else if (s === 'at_risk') at_risk++;
      else if (s === 'on_track') on_track++;
      else if (s === 'met') met++;
      else if (s === 'missed') missed++;
    }
    return { overdue, at_risk, on_track, met, missed };
  }, [sorted]);

  const pills = useMemo((): FilterPill[] => [
    { key: 'all',      label: 'All',      count: sorted.length },
    { key: 'overdue',  label: 'Overdue',  count: counts.overdue,  variant: 'danger'  },
    { key: 'at_risk',  label: 'At Risk',  count: counts.at_risk,  variant: 'warning' },
    { key: 'on_track', label: 'On Track', count: counts.on_track, variant: 'success' },
    { key: 'met',      label: 'Met',      count: counts.met,      variant: 'success' },
    { key: 'missed',   label: 'Missed',   count: counts.missed,   variant: 'danger'  },
  ], [sorted.length, counts]);

  const visibleTickets = useMemo(() => {
    if (slaFilter === 'all') return sorted;
    return sorted.filter((t) => {
      const s = slaState(t);
      if (slaFilter === 'overdue') return s === 'overdue';
      if (slaFilter === 'at_risk')  return s === 'at_risk';
      if (slaFilter === 'met')      return s === 'met';
      if (slaFilter === 'missed')   return s === 'missed';
      if (slaFilter === 'on_track') return s === 'on_track' || s === 'no_sla';
      return true;
    });
  }, [sorted, slaFilter]);

  /**
   * Compliance over tickets whose outcome is known: met, missed, or already
   * overdue. Tickets still inside their target have no outcome yet and would
   * otherwise be counted as successes they have not earned.
   */
  const compliance = useMemo(() => {
    const decided = counts.met + counts.missed + counts.overdue;
    if (!decided) return 100;
    return Math.round((counts.met / decided) * 100);
  }, [counts]);

  const handleRowClick = useCallback((ticket: Ticket) => {
    onTicketSelect?.(ticket.id);
  }, [onTicketSelect]);

  const handleRefresh = useCallback(() => refetch(), [refetch]);

  // Not overdue+at_risk+on_track — `missed` tickets are settled, not running.
  const live = sorted.filter((t) => !SETTLED.has(t.status)).length;
  const subtitle = loading
    ? 'Loading…'
    : totalTickets > 100
      ? `Showing 100 of ${totalTickets} tickets`
      : `${sorted.length} ticket${sorted.length !== 1 ? 's' : ''} in scope · ${live} still running`;

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-background space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {subSections.length > 1 && (
            <Select
              value={tradeId ? String(tradeId) : 'all'}
              onValueChange={(v) => setTradeId(v === 'all' ? null : Number(v))}
            >
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="All trades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trades</SelectItem>
                {subSections.map((s) => (
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center py-4">
          <CardContent className="p-0">
            <SLAComplianceGauge value={compliance} loading={loading} size={100} />
          </CardContent>
        </Card>
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          label="Overdue"
          value={counts.overdue}
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
        <KpiCard
          icon={<CheckCheck className="h-5 w-5 text-gray-500" />}
          label="Met / Missed"
          value={counts.met}
          secondary={counts.missed > 0 ? `${counts.missed} missed` : undefined}
          loading={loading}
          colorClass="bg-gray-50 border-gray-200"
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
          slaFilter === 'overdue' ? 'No overdue tickets'
          : slaFilter === 'at_risk' ? 'No at-risk tickets'
          : 'No tickets found'
        }
        emptyDescription={
          slaFilter === 'all'
            ? 'No tickets are tracked for SLA'
            : 'Nothing in this bucket'
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
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  colorClass: string;
  secondary?: string;
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
          {secondary && !loading && (
            <p className="text-xs text-status-escalated mt-0.5">{secondary}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
