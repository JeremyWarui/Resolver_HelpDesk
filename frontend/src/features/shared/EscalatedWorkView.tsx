/**
 * Escalated work — what has climbed above the technician, and how long it has
 * sat there.
 *
 * Escalation here is structural, not a workflow anyone configures: a ticket
 * whose active time passes its priority's threshold moves technician → HOS →
 * HOD automatically. So this page is not a queue anybody chose to create; it is
 * the list of jobs the system decided somebody more senior needs to know about.
 *
 * The HOS sees what has landed on them. The HOD sees the same for their campus,
 * including what is still sitting with the HOS — because "my section head has
 * eleven escalations open" is the HOD's problem before it is anyone else's.
 *
 * No new endpoint: `/tickets/?escalated=1` is one filter over the same
 * role-scoped, pre-loaded queryset the tickets page already uses.
 */
import { useMemo } from 'react';
import { ShieldAlert, TrendingUp } from 'lucide-react';
import { useTickets } from '@/hooks/tickets/useTickets';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import MetricCard from '@/components/shared/data/MetricCard';
import { ROLE_LABELS } from '@/constants/roles';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/authStore';
import type { Ticket, UserRole } from '@/types';

type EscalatedRole = 'technician' | 'hos' | 'hod';

interface Props {
  role: EscalatedRole;
  onTicketSelect?: (id: number) => void;
}

const SUBTITLE: Record<EscalatedRole, string> = {
  // The technician is the one person escalation is *about*, and was the only
  // one who could not see it: no page, no badge, nothing they would read as
  // "this is now your section head's problem too". Same rows, same filter —
  // framed as a heads-up rather than a worklist, because escalating does not
  // reassign anything; the job stays exactly where it was.
  //
  // Scoped to what they hold, not their whole trade. It listed the trade
  // originally, on the reasoning that escalation is the section's problem —
  // but a page of colleagues' late jobs is a list nobody owns, and a
  // technician cannot act on any of it (`TicketStatusUpdateView` gives section
  // scope view-only). Their own late work is the part they can do something
  // about, and Section Tickets already shows the trade.
  technician:
    'Jobs assigned to you that ran past their threshold and were raised to your section head. Escalating does not move the work — these are still yours to finish.',
  hos:
    'Jobs that passed their threshold and were raised to you. Each one is late enough that the system stopped waiting for the technician.',
  hod:
    'Jobs raised above the technician anywhere on your campus — including those still sitting with the section head.',
};

/** A supervisor's empty state is about their whole scope; a technician's is
 *  about what they hold, which is the same distinction the subtitles draw. */
const SUPERVISOR_EMPTY = 'Every job in your scope is still with the technician it was assigned to.';
const EMPTY_DESCRIPTION: Record<EscalatedRole, string> = {
  technician: 'Nothing you hold has passed its threshold.',
  hos: SUPERVISOR_EMPTY,
  hod: SUPERVISOR_EMPTY,
};

export default function EscalatedWorkView({ role, onTicketSelect }: Props) {
  const userId = useAuthStore((st) => st.user?.id);
  const isTechnician = role === 'technician';

  // Narrows within the server's scope, never past it. Skipped until the id is
  // known, so the un-narrowed request never fires and briefly shows the trade.
  const { tickets, loading } = useTickets(
    {
      escalated: '1',
      page_size: 200,
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

  // Breaching is server-derived (`is_breaching` already accounts for paused
  // tickets), so this never disagrees with the badge on the ticket itself.
  const breaching = tickets.filter((t: Ticket) => t.is_breaching).length;
  const total = tickets.length;

  return (
    <main className="flex-1 overflow-y-auto bg-muted/30 p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Escalated</h1>
        <p className="text-sm text-muted-foreground">{SUBTITLE[role]}</p>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Nothing has escalated</p>
            <p className="text-sm text-muted-foreground">{EMPTY_DESCRIPTION[role]}</p>
          </CardContent>
        </Card>
      ) : (
        <>
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
          />

          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Escalation is automatic and structural — nobody chose to send these
              up. A ticket that escalates is one the section did not close in the
              time its priority allows, so a rising count here is a capacity or
              triage signal, not a discipline one.
            </span>
          </p>
        </>
      )}
    </main>
  );
}
