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
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Ticket } from '@/types';

export type EscalatedRole = 'technician' | 'hos' | 'hod';

interface Props {
  role: EscalatedRole;
  onTicketSelect?: (id: number) => void;
}

const COPY: Record<EscalatedRole, { subtitle: string }> = {
  // The technician is the one person escalation is *about*, and was the only
  // one who could not see it: no page, no badge, nothing they would read as
  // "this is now your section head's problem too". Same rows, same filter —
  // framed as a heads-up rather than a worklist, because escalating does not
  // reassign anything; the job stays exactly where it was.
  //
  // Scope is the technician's (campus, trade) pairs, same as Section Tickets —
  // so this lists what has escalated in their trades, not only what they hold.
  technician: {
    subtitle:
      'Jobs in your trades that ran past their threshold and were raised to your section head. Escalating does not move the work — these are still the section’s to finish.',
  },
  hos: {
    subtitle:
      'Jobs that passed their threshold and were raised to you. Each one is late enough that the system stopped waiting for the technician.',
  },
  hod: {
    subtitle:
      'Jobs raised above the technician anywhere on your campus — including those still sitting with the section head.',
  },
};

const EMPTY_DESCRIPTION: Record<EscalatedRole, string> = {
  technician: 'Nothing you hold has passed its threshold.',
  hos: 'Every job in your scope is still with the technician it was assigned to.',
  hod: 'Every job in your scope is still with the technician it was assigned to.',
};

const LEVEL_LABEL: Record<string, string> = {
  hos: 'Section head',
  hod: 'Head of department',
};

export default function EscalatedWorkView({ role, onTicketSelect }: Props) {
  const { tickets, loading } = useTickets({ escalated: '1', page_size: 200 });

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
        <p className="text-sm text-muted-foreground">{COPY[role].subtitle}</p>
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
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Escalated
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                  {total}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Past their deadline
                </p>
                <p
                  className="mt-1 text-3xl font-semibold tabular-nums"
                  style={{ color: breaching ? 'var(--status-escalated-text)' : undefined }}
                >
                  {breaching}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sitting with
                </p>
                <div className="mt-1 space-y-0.5">
                  {[...byLevel].map(([level, count]) => (
                    <p key={level} className="text-sm">
                      <span className="font-semibold tabular-nums">{count}</span>{' '}
                      <span className="text-muted-foreground">
                        {LEVEL_LABEL[level] ?? level}
                      </span>
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
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
