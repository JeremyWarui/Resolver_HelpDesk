// SLA tracking for an HOS or HOD. Classifies the tickets in scope as overdue,
// at risk, on track, met or missed; overdue sorts to the top. Refreshes every
// 60 seconds, and narrows by trade.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, CheckCheck, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { useTicketFilterOptions, useTickets } from '@/hooks/tickets/useTickets';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { SLAComplianceGauge } from '@/components/shared/data/SLAComplianceGauge';
import MetricCard from '@/components/shared/data/MetricCard';
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
import type { FilterPill, Ticket } from '@/types';

const AT_RISK_MS = 24 * 60 * 60 * 1000;

type SlaFilter = 'all' | 'overdue' | 'at_risk' | 'on_track' | 'met' | 'missed';
type SlaState  = 'overdue' | 'at_risk' | 'on_track' | 'met' | 'missed' | 'no_sla';

const SETTLED: ReadonlySet<Ticket['status']> = new Set(['resolved', 'closed']);

/**
 * A ticket's SLA outcome.
 *
 * Settled and running are judged differently. A resolved ticket's outcome is
 * fixed and is measured against `resolved_at`, never the clock — comparing a
 * finished ticket's due date to now marks every closed ticket late once that
 * date passes.
 *
 * So a miss has two names. `overdue` is live and past target, which is work to
 * chase and what analytics counts under the same word. `missed` is settled and
 * finished late, which is history.
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

  const { trades } = useTicketFilterOptions();

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
      : tickets.filter((t) => t.trade?.id === tradeId);
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
   * Settled work that finished within target — `met / (met + missed)`, the same
   * definition `analytics/metrics.py` uses for `resolution_sla_pct`.
   *
   * Overdue tickets are deliberately out of the denominator even though they
   * can no longer be met. Counting them here made this read 47% against the
   * reports page's 89% for the same section at the same moment: two numbers,
   * near-identical labels, two clicks apart. REVIEW.md §7 is explicit that
   * overdue and missed are different words and must not share one. Nothing is
   * hidden by leaving them out — the Overdue card sits beside this gauge and
   * counts them on their own terms.
   *
   * This still will not equal the reports page unless that page's range is set
   * to cover everything: this view takes no window, and reports defaults to 30
   * days. That difference is a control the reader can see, which is the whole
   * point of removing the one they could not.
   */
  const compliance = useMemo(() => {
    const settled = counts.met + counts.missed;
    if (!settled) return 100;
    return Math.round((counts.met / settled) * 100);
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
          {trades.length > 1 && (
            <Select
              value={tradeId ? String(tradeId) : 'all'}
              onValueChange={(v) => setTradeId(v === 'all' ? null : Number(v))}
            >
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="All trades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trades</SelectItem>
                {trades.map((s) => (
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
            <SLAComplianceGauge value={compliance} loading={loading} size={100} label="Resolution SLA" />
          </CardContent>
        </Card>
        <MetricCard
          title="Overdue"
          value={counts.overdue}
          tone={counts.overdue ? 'alert' : 'default'}
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          iconBgColor="bg-red-50"
          isLoading={loading}
        />
        <MetricCard
          title="At Risk (<24h)"
          value={counts.at_risk}
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          iconBgColor="bg-amber-50"
          isLoading={loading}
        />
        <MetricCard
          title="On Track"
          value={counts.on_track}
          icon={<CheckCircle className="h-5 w-5 text-green-600" />}
          iconBgColor="bg-green-50"
          isLoading={loading}
        />
        <MetricCard
          title="Met / Missed"
          value={counts.met}
          description={counts.missed > 0 ? `${counts.missed} missed` : undefined}
          icon={<CheckCheck className="h-5 w-5 text-gray-500" />}
          iconBgColor="bg-gray-50"
          isLoading={loading}
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
