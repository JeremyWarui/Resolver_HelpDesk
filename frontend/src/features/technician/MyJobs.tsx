import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Hand, Wrench } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TabBar } from '@/components/shared/data/TabBar';
import { StatusUpdateModal } from './StatusUpdateModal';
import { JobCard, type JobAction } from './JobCard';
import { useTickets } from '@/hooks/tickets/useTickets';
import { useAuthStore } from '@/stores/authStore';
import { claimTicket, startWork } from '@/lib/api/tickets';
import { ROLE_BASE } from '@/constants/roles';
import { ESCALATED_LEVELS, HELD_STATUSES, WORKING_STATUSES } from '@/constants/tickets';
import type { Ticket } from '@/types';

type MyJobsTab = 'active' | 'available' | 'pending' | 'escalated' | 'assigned';

/** Each tab's address under the technician's base path. */
const TAB_PATH: Record<MyJobsTab, string> = {
  active: '',
  available: 'available',
  pending: 'pending',
  escalated: 'escalated',
  assigned: 'assigned',
};

/** Overdue first, then the soonest deadline; a job with no target last. */
function byUrgency(a: Ticket, b: Ticket): number {
  if (!!a.is_breaching !== !!b.is_breaching) return a.is_breaching ? -1 : 1;
  const due = (t: Ticket) => (t.resolution_due_at ? new Date(t.resolution_due_at).getTime() : Infinity);
  return due(a) - due(b);
}

/** The button a card offers, by where the job stands and whose it is. */
function actionFor(ticket: Ticket, mine: boolean): JobAction | null {
  if (!mine) return ticket.status === 'open' ? 'claim' : null;
  if (ticket.status === 'assigned') return 'start';
  if (ticket.status === 'in_progress') return 'update';
  return null;
}

interface MyJobsProps {
  tab: MyJobsTab;
  onTicketSelect?: (id: number) => void;
  /** The panel for the tabs that reuse an existing view: on hold, escalated, all. */
  panel?: ReactNode;
}

/**
 * The technician's workbench: what to do next, what is free to take, and
 * what is stopped, each a tab with its own address. Active and Available are
 * cards with the next action on them; the other tabs are the existing views.
 */
export default function MyJobs({ tab, onTicketSelect, panel }: MyJobsProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  // Their own live jobs: every count but Available comes from these rows. Live
  // only, so a long history of finished jobs can never push one off the page.
  const mine = useTickets({ assigned_to: userId, status: 'active', page_size: 100 }, !userId);
  // `open` means unassigned, and the server lists only this technician's
  // (campus, trade) pairs, so these are exactly the jobs they may claim.
  const available = useTickets({ status: 'open', page_size: 100 });

  const active = useMemo(
    () => mine.tickets.filter((t) => WORKING_STATUSES.includes(t.status)).sort(byUrgency),
    [mine.tickets],
  );
  const claimable = useMemo(() => [...available.tickets].sort(byUrgency), [available.tickets]);
  const onHold = mine.tickets.filter((t) => t.status === 'pending').length;
  // The server's `escalated=1`: above the technician, and still held.
  const escalated = mine.tickets.filter(
    (t) => t.current_level && ESCALATED_LEVELS.includes(t.current_level)
      && HELD_STATUSES.includes(t.status),
  ).length;
  const overdue = active.filter((t) => t.is_breaching).length;

  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const [updating, setUpdating] = useState<Ticket | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['nav-count'] });
  }

  async function act(ticket: Ticket, action: JobAction) {
    if (action === 'update') {
      setUpdating(ticket);
      return;
    }
    setBusy((ids) => new Set(ids).add(ticket.id));
    try {
      if (action === 'claim') {
        await claimTicket(ticket.id);
        toast.success(`${ticket.ticket_no} is yours, and in progress.`);
        // The card leaves this list; keep focus in the panel, not on the page.
        document.getElementById('my-jobs-panel')?.focus();
      } else {
        await startWork(ticket.id);
        toast.success(`Started ${ticket.ticket_no}.`);
      }
    } catch {
      toast.error(
        action === 'claim'
          ? 'Could not claim it. Someone may have taken it first.'
          : 'Could not start this job. Please try again.',
      );
    } finally {
      setBusy((ids) => {
        const next = new Set(ids);
        next.delete(ticket.id);
        return next;
      });
      refresh();
    }
  }

  const tabs = [
    { key: 'active' as const, label: 'Active', count: active.length, urgent: overdue > 0 },
    { key: 'available' as const, label: 'Available', count: available.totalTickets },
    { key: 'pending' as const, label: 'On Hold', count: onHold },
    { key: 'escalated' as const, label: 'Escalated', count: escalated, urgent: true },
    { key: 'assigned' as const, label: 'All My Jobs' },
  ];

  const cards = (list: Ticket[], mineList: boolean, loading: boolean, empty: ReactNode) =>
    loading ? (
      <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    ) : list.length === 0 ? (
      empty
    ) : (
      <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => {
          const action = actionFor(t, mineList);
          return (
            <JobCard
              key={t.id}
              ticket={t}
              action={action}
              busy={busy.has(t.id)}
              onOpen={() => onTicketSelect?.(t.id)}
              onAction={action ? () => act(t, action) : undefined}
            />
          );
        })}
      </div>
    );

  const summary = mine.loading ? 'Loading your jobs…'
    : active.length === 0 ? 'Nothing on your bench right now.'
    : `${active.length} active job${active.length === 1 ? '' : 's'}${overdue ? `, ${overdue} overdue` : ''}.`;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Hello, {user?.first_name || 'there'}</h2>
        <p className={overdue ? 'text-sm font-medium text-red-700' : 'text-sm text-gray-500'}>{summary}</p>
      </div>

      <Card className="overflow-hidden">
        <TabBar
          tabs={tabs}
          active={tab}
          onSelect={(key) => navigate(`${ROLE_BASE.technician}${TAB_PATH[key] ? `/${TAB_PATH[key]}` : ''}`)}
          panelId="my-jobs-panel"
          label="My jobs"
        />
        <div
          tabIndex={-1}
          role="tabpanel"
          id="my-jobs-panel"
          aria-labelledby={`my-jobs-panel-tab-${tab}`}
          className="focus:outline-none"
        >
          {tab === 'active' && cards(active, true, mine.loading, (
            <Empty
              icon={<Wrench className="h-8 w-8" />}
              title="No active jobs"
              hint={claimable.length ? 'There are jobs available to claim.' : 'New jobs assigned to you will appear here.'}
            />
          ))}
          {tab === 'available' && cards(claimable, false, available.loading, (
            <Empty
              icon={<Hand className="h-8 w-8" />}
              title="Nothing to claim"
              hint="Open jobs in your trades at your campus appear here."
            />
          ))}
          {tab === 'available' && available.totalTickets > claimable.length && (
            <p className="px-5 pb-4 text-xs text-gray-500">
              Showing the {claimable.length} most urgent of {available.totalTickets} open jobs.
            </p>
          )}
          {/* The views behind these tabs load on first visit; only the panel waits. */}
          {tab !== 'active' && tab !== 'available' && (
            <Suspense fallback={<div className="p-5"><Skeleton className="h-40 rounded-xl" /></div>}>
              {panel}
            </Suspense>
          )}
        </div>
      </Card>

      {updating && (
        <StatusUpdateModal
          ticket={updating}
          open
          onClose={() => setUpdating(null)}
          onSuccess={() => { setUpdating(null); refresh(); }}
        />
      )}
    </div>
  );
}

function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="text-gray-300" aria-hidden>{icon}</span>
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-xs text-gray-500">{hint}</p>
    </div>
  );
}
