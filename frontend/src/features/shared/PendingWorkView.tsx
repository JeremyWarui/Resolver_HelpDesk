/**
 * Pending Work — what is stopped, why, and for how long.
 *
 * One component, two faces, because two roles ask different questions of the
 * same fact:
 *
 *   HOS / HOD  → a worklist. "Which jobs are stopped and who do I chase?"
 *                Rows are actionable: resume clears the hold in one click.
 *   Manager    → the shape. "What is stopping my organisation's work?"
 *                No ticket numbers — a director does not chase ticket 0009,
 *                they chase the reason three quarters of the rows share.
 *
 * Built as one view rather than two pages so the two can never disagree: they
 * read the same scoped rows over the same request.
 *
 * No new endpoint. `GET /tickets/?status=pending` is already role-scoped
 * server-side and already pre-loads the facility, trade and assignee in a
 * single query, so a 4-row list and a 400-row list cost the same. "Pending for"
 * is arithmetic on `paused_at`, which is already in the payload — no extra
 * field, no extra call.
 */
import { useMemo, useState } from 'react';
import { AlertCircle, PauseCircle } from 'lucide-react';
import { useTickets } from '@/hooks/tickets/useTickets';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import ChartCard from '@/components/shared/data/ChartCard';
import { ResumeWorkModal } from '@/components/shared/ticket/ResumeWorkModal';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Ticket } from '@/types';

export type PendingWorkRole = 'manager' | 'hod' | 'hos';

interface Props {
  role: PendingWorkRole;
  onTicketSelect?: (id: number) => void;
}

const COPY: Record<PendingWorkRole, { title: string; subtitle: string }> = {
  manager: {
    title: 'Pending Work',
    subtitle: 'What is holding up maintenance across the organisation.',
  },
  hod: {
    title: 'Pending Work',
    subtitle: 'Jobs on hold across your campus — why, and for how long.',
  },
  hos: {
    title: 'Pending Work',
    subtitle: 'Jobs your section has stopped, and what each one is waiting for.',
  },
};

/** Days a ticket has been on hold. Null when it somehow has no pause stamp. */
function pendingDays(ticket: Ticket): number | null {
  if (!ticket.paused_at) return null;
  return Math.floor((Date.now() - new Date(ticket.paused_at).getTime()) / 86_400_000);
}

export default function PendingWorkView({ role, onTicketSelect }: Props) {
  // page_size is generous on purpose: this list is bounded by how much work is
  // stuck, which is a small number in any healthy section — and if it is not
  // small, seeing all of it is the point.
  const { tickets, loading, refetch } = useTickets({ status: 'pending', page_size: 200 });
  const [acting, setActing] = useState<{ ticket: Ticket; mode: 'resume' | 'change' } | null>(null);

  const isManager = role === 'manager';

  // Grouped in the browser rather than fetched: these are the same rows already
  // on screen, so a second round trip to count them would be a request that can
  // disagree with the table beside it.
  const byReason = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      const label = t.pending_reason_display || 'Not recorded';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [tickets]);

  const longest = useMemo(() => {
    let worst: { ticket: Ticket; days: number } | null = null;
    for (const t of tickets) {
      const d = pendingDays(t);
      if (d !== null && (!worst || d > worst.days)) worst = { ticket: t, days: d };
    }
    return worst;
  }, [tickets]);

  const total = tickets.length;
  const stalled = tickets.filter((t) => (pendingDays(t) ?? 0) >= 7).length;

  return (
    <main className="flex-1 overflow-y-auto bg-muted/30 p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{COPY[role].title}</h1>
        <p className="text-sm text-muted-foreground">{COPY[role].subtitle}</p>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <PauseCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Nothing is on hold</p>
            <p className="text-sm text-muted-foreground">
              Every job in your scope is either being worked on or finished.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* The two numbers worth leading with. Not a five-card strip: this
              page answers one question and padding it would bury the answer. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Jobs on hold
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Held over a week
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span
                    className="text-3xl font-semibold tabular-nums"
                    style={{ color: stalled ? 'var(--status-escalated-text)' : undefined }}
                  >
                    {stalled}
                  </span>
                  {longest && longest.days >= 7 && (
                    <span className="text-sm text-muted-foreground">
                      longest {longest.days} days
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Why work is pending — the shape, for everyone. It leads for the
              manager and follows the worklist for the section heads, but it is
              the same figure either way. Counts are printed beside every bar:
              the bar is the comparison, the number is the fact, and neither
              relies on colour to carry meaning. */}
          <ChartCard
            title="Why work is pending"
            description={
              isManager
                ? 'Each bar is a decision — stores, procurement, or capacity.'
                : 'What your held jobs are waiting for.'
            }
          >
            <div className="space-y-2.5">
              {byReason.map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <span className="w-56 shrink-0 truncate text-sm" title={r.label}>
                    {r.label}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(r.count / total) * 100}%`,
                        backgroundColor: 'var(--chart-1)',
                      }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                    {r.count} ({Math.round((r.count / total) * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* The worklist. Withheld from the manager on purpose — they act on
              the pattern above, not on individual jobs, and a director who has
              to read ticket numbers to understand their estate is being handed
              the wrong instrument. They can still reach any ticket through the
              tickets page if they want one. */}
          {!isManager && (
            <TicketTable
              tickets={tickets}
              variant="pending"
              loading={loading}
              title="Jobs on hold"
              onRowClick={(t) => onTicketSelect?.(t.id)}
              onResume={(t) => setActing({ ticket: t, mode: 'resume' })}
              onChangeReason={(t) => setActing({ ticket: t, mode: 'change' })}
              searchPlaceholder="Search by ticket number or job…"
              emptyMessage="Nothing is on hold"
              emptyDescription="Every job in your scope is being worked on or finished."
              rowClassName={(t) =>
                (pendingDays(t) ?? 0) >= 30
                  ? 'border-l-2 border-status-escalated bg-status-escalated/5'
                  : ''
              }
            />
          )}

          {stalled > 0 && !isManager && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {stalled} job{stalled === 1 ? ' has' : 's have'} been held more than a week.
                A hold that outlives the thing it was waiting for stops being a pause and
                starts being a backlog.
              </span>
            </p>
          )}
        </>
      )}

      {acting && (
        <ResumeWorkModal
          ticket={acting.ticket}
          mode={acting.mode}
          open
          onClose={() => setActing(null)}
          onDone={() => {
            setActing(null);
            refetch();
          }}
        />
      )}
    </main>
  );
}
