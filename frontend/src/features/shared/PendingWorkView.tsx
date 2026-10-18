/**
 * Pending Work: what is stopped, why, and for how long. Every row can be
 * resumed or re-coded from here. Rows come from `/tickets/?status=pending`,
 * scoped by the server; how long a job has been held is worked out from `paused_at`.
 */
import { useMemo, useState } from 'react';
import { AlertCircle, PauseCircle } from 'lucide-react';
import { useTickets } from '@/hooks/tickets/useTickets';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import ChartCard from '@/components/shared/data/ChartCard';
import MetricCard from '@/components/shared/data/MetricCard';
import { ResumeWorkModal } from '@/components/shared/ticket/ResumeWorkModal';
import { useAuthStore } from '@/stores/authStore';
import type { Ticket } from '@/types';
import WorkQueueShell from './WorkQueueShell';

type PendingWorkRole = 'hod' | 'hos' | 'technician';

interface Props {
  role: PendingWorkRole;
  onTicketSelect?: (id: number) => void;
  /** Inside another page's tab: no page title or background of its own. */
  embedded?: boolean;
}

/** The page is called the same thing for everyone; only what it covers differs. */
const SUBTITLE: Record<PendingWorkRole, string> = {
  hod: 'Jobs on hold across your campus — why, and for how long.',
  hos: 'Jobs your section has stopped, and what each one is waiting for.',
  // Only the technician's own jobs: they may change status on nothing else.
  technician:
    'Your jobs that are stopped, why, and for how long. Resume one when the thing it was waiting for arrives.',
};

/** Stable reference: a fresh array each render would re-memo the column map. */
const HIDE_FOR_TECHNICIAN = ['assigned_to'];

/** Days a ticket has been on hold. Null when it somehow has no pause stamp. */
function pendingDays(ticket: Ticket): number | null {
  if (!ticket.paused_at) return null;
  return Math.floor((Date.now() - new Date(ticket.paused_at).getTime()) / 86_400_000);
}

export default function PendingWorkView({ role, onTicketSelect, embedded = false }: Props) {
  const userId = useAuthStore((st) => st.user?.id);
  const isTechnician = role === 'technician';

  // A technician's list waits for their id, so an unnarrowed request never fires.
  const { tickets, loading, refetch } = useTickets(
    {
      status: 'pending',
      page_size: 100,
      ...(isTechnician && userId ? { assigned_to: userId } : {}),
    },
    isTechnician && !userId,
  );
  const [acting, setActing] = useState<{ ticket: Ticket; mode: 'resume' | 'change' } | null>(null);

  // Counted from the rows on screen, so the chart always agrees with the table.
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
    <>
      <WorkQueueShell
        title="Pending Work"
        subtitle={SUBTITLE[role]}
        embedded={embedded}
        loading={loading}
        empty={total === 0 ? {
          icon: PauseCircle,
          title: 'Nothing is on hold',
          text: isTechnician
            ? 'Every job you hold is either being worked on or finished.'
            : 'Every job in your scope is either being worked on or finished.',
        } : null}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard title="Jobs on hold" value={total} />
          <MetricCard
            title="Held over a week"
            value={stalled}
            tone={stalled ? 'alert' : 'default'}
            description={
              longest && longest.days >= 7 ? `longest ${longest.days} days` : undefined
            }
          />
        </div>

        <ChartCard
          title="Why work is pending"
          description="What your held jobs are waiting for."
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

        <TicketTable
          tickets={tickets}
          variant="pending"
          loading={loading}
          // Every row on a technician's page is assigned to them.
          hideColumns={isTechnician ? HIDE_FOR_TECHNICIAN : undefined}
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

        {stalled > 0 && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {stalled} job{stalled === 1 ? ' has' : 's have'} been held more than a week.
              A hold that outlives the thing it was waiting for stops being a pause and
              starts being a backlog.
            </span>
          </p>
        )}
      </WorkQueueShell>

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
    </>
  );
}
