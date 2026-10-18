/**
 * Escalated work: what has climbed above the technician, and how long it has
 * sat there. Escalation is automatic, technician → HOS → HOD on the priority's
 * thresholds, so this lists the jobs the system raised, not ones anybody sent.
 *
 * The HOS sees what landed on them; the HOD sees their campus, including what
 * still sits with the HOS. Rows come from `/tickets/?escalated=1`, scoped by the server.
 */
import { useMemo } from 'react';
import { ShieldAlert, TrendingUp } from 'lucide-react';
import { useTickets } from '@/hooks/tickets/useTickets';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import MetricCard from '@/components/shared/data/MetricCard';
import { ROLE_LABELS } from '@/constants/roles';
import { useAuthStore } from '@/stores/authStore';
import type { Ticket, UserRole } from '@/types';
import WorkQueueShell from './WorkQueueShell';

type EscalatedRole = 'technician' | 'hos' | 'hod';

/** Stable reference: a fresh array each render would re-memo the column map. */
const HIDE_FOR_TECHNICIAN = ['assigned_to'];

interface Props {
  role: EscalatedRole;
  onTicketSelect?: (id: number) => void;
  /** Inside another page's tab: no page title or background of its own. */
  embedded?: boolean;
}

/** A technician sees only the jobs they hold: escalating does not reassign them. */
const SUBTITLE: Record<EscalatedRole, string> = {
  technician:
    'Jobs assigned to you that ran past their threshold and were raised to your section head. Escalating does not move the work — these are still yours to finish.',
  hos:
    'Jobs that passed their threshold and were raised to you. Each one is late enough that the system stopped waiting for the technician.',
  hod:
    'Jobs raised above the technician anywhere on your campus — including those still sitting with the section head.',
};

const SUPERVISOR_EMPTY = 'Every job in your scope is still with the technician it was assigned to.';
const EMPTY_DESCRIPTION: Record<EscalatedRole, string> = {
  technician: 'Nothing you hold has passed its threshold.',
  hos: SUPERVISOR_EMPTY,
  hod: SUPERVISOR_EMPTY,
};

export default function EscalatedWorkView({ role, onTicketSelect, embedded = false }: Props) {
  const userId = useAuthStore((st) => st.user?.id);
  const isTechnician = role === 'technician';

  // A technician's list waits for their id, so an unnarrowed request never fires.
  const { tickets, loading } = useTickets(
    {
      escalated: '1',
      page_size: 100,
      ...(isTechnician && userId ? { assigned_to: userId } : {}),
    },
    isTechnician && !userId,
  );

  const byLevel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      const key = t.current_level ?? 'unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [tickets]);

  // `is_breaching` comes from the server, which leaves paused tickets out.
  const breaching = tickets.filter((t: Ticket) => t.is_breaching).length;
  const total = tickets.length;

  return (
    <WorkQueueShell
      title="Escalated"
      subtitle={SUBTITLE[role]}
      embedded={embedded}
      loading={loading}
      empty={total === 0 ? { icon: ShieldAlert, title: 'Nothing has escalated', text: EMPTY_DESCRIPTION[role] } : null}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard title="Escalated" value={total} />
        <MetricCard
          title="Past their deadline"
          value={breaching}
          tone={breaching ? 'alert' : 'default'}
        />
        <MetricCard
          title="Sitting with"
          value={
            <span className="space-y-0.5 text-sm font-normal">
              {[...byLevel].map(([level, count]) => (
                <span key={level} className="block">
                  <span className="font-semibold tabular-nums">{count}</span>{' '}
                  <span className="text-muted-foreground">{ROLE_LABELS[level as UserRole] ?? level}</span>
                </span>
              ))}
            </span>
          }
        />
      </div>

      <TicketTable
        tickets={tickets}
        variant="queue"
        loading={loading}
        title="Escalated tickets"
        onRowClick={(t) => onTicketSelect?.(t.id)}
        searchPlaceholder="Search by ticket number or job…"
        emptyMessage="Nothing has escalated"
        emptyDescription={EMPTY_DESCRIPTION[role]}
        rowClassName={(t) =>
          t.is_breaching
            ? 'border-l-2 border-status-escalated bg-status-escalated/5'
            : ''
        }
        // Every row is the technician's own, so who has it says nothing.
        hideColumns={isTechnician ? HIDE_FOR_TECHNICIAN : undefined}
      />

      {!embedded && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Escalation is automatic and structural — nobody chose to send these
            up. A ticket that escalates is one the section did not close in the
            time its priority allows, so a rising count here is a capacity or
            triage signal, not a discipline one.
          </span>
        </p>
      )}
    </WorkQueueShell>
  );
}
