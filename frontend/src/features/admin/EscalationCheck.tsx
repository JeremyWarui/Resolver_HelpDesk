import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { DialogActions } from '@/components/shared/forms/DialogActions';
import { useEscalationStatus, useRunEscalations } from '@/hooks/useEscalations';
import { previewEscalations } from '@/lib/api/tickets';
import { ESCALATION_LEVEL, ESCALATION_SCHEDULE } from '@/constants/roles';
import type { EscalationRun, EscalationStatus } from '@/types';
import { formatDateTime, timeAgo } from '@/utils/date';
import { cn } from '@/lib/utils';


/** How a run that has not finished reads in its Took column. */
const OUTCOME = {
  failed: 'Failed',
  running: 'Running…',
  did_not_finish: 'Did not finish',
} as const;

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Whether the scheduled escalation check is alive, what it would move now,
 *  and the way to run it by hand. Every figure comes from `/escalations/`. */
export default function EscalationCheck() {
  const { status, loading, error } = useEscalationStatus();
  const run = useRunEscalations();
  const [previewing, setPreviewing] = useState(false);

  const runNow = () =>
    run.mutate(undefined, {
      onSuccess: (r) => {
        const moved = `${r.to_hos} to the HOS, ${r.to_hod} to the HOD`;
        if (r.error) toast.warning(`Escalation check ran (${moved}), but skipped tickets it could not move: see Recent runs.`);
        else toast.success(`Escalation check ran: ${moved}.`);
        setPreviewing(false);
      },
      onError: () => toast.error('The escalation check failed. The run is recorded with its error.'),
    });

  if (error) {
    return <Card className="p-6 text-sm text-destructive">The escalation check could not be loaded.</Card>;
  }
  if (loading || !status) return <Skeleton className="h-48 w-full rounded-xl" />;

  const look = ESCALATION_SCHEDULE[status.state];
  return (
    <Card aria-label="Escalation check" className={cn('space-y-4 p-6', look.alert ? 'border-red-200' : 'border-emerald-200')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold">Escalation check</h2>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', look.alert ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800')}>{look.label}</span>
          </div>
          <p className="text-sm text-muted-foreground">{summary(status)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreviewing(true)}>Preview</Button>
          <Button onClick={runNow} disabled={run.isPending}>{run.isPending ? 'Running…' : 'Run now'}</Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 overflow-hidden rounded-lg border lg:grid-cols-4">
        <Fact label="Last scheduled run" tone={status.state === 'running' ? undefined : 'bad'}>
          {status.last_run?.finished_at
            ? `${clock(status.last_run.finished_at)} · ${timeAgo(status.last_run.finished_at)}`
            : status.state === 'running' ? 'In progress'
              : status.state === 'never' ? 'Never' : 'None finished'}
        </Fact>
        <Fact label="Due to climb now">
          {status.due.hos || status.due.hod ? `${status.due.hos} to the HOS · ${status.due.hod} to the HOD` : 'None'}
        </Fact>
        <Fact label="Should run">Every {status.interval_minutes} minutes</Fact>
        <Fact label="Next run" muted={status.state !== 'running'}>{nextRun(status)}</Fact>
      </dl>

      {(status.state === 'never' || status.state === 'stale') && (
        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">To schedule it on the Windows server</p>
          <p className="text-muted-foreground">
            Run <code className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs">scripts\windows\register-escalation-task.ps1</code> once,
            in an elevated PowerShell. Task Scheduler then runs{' '}
            <code className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs">manage.py process_auto_escalations</code>{' '}
            every {status.interval_minutes} minutes, and this card turns green on its first run.
          </p>
        </div>
      )}

      {status.runs.length > 0 && <RecentRuns runs={status.runs} staleAfter={status.stale_after_minutes} />}

      <PreviewDialog open={previewing} onClose={() => setPreviewing(false)} onRun={runNow} running={run.isPending} />
    </Card>
  );
}

function summary(status: EscalationStatus): string {
  const what = "Compares every open ticket with its priority's To HOS and To HOD times below, and moves it up.";
  if (status.state === 'never') return `${what} Nothing runs it yet, so no ticket has climbed on its own.`;
  if (status.state === 'failing') {
    return `${what} The schedule runs, but its runs are failing or not finishing: see Recent runs.`;
  }
  if (status.state === 'stale') {
    return `${what} No run has started in the last ${status.stale_after_minutes} minutes, so the schedule has stopped.`;
  }
  return what;
}

function nextRun(status: EscalationStatus): string {
  if (status.state === 'never') return 'Not scheduled';
  if (status.state === 'stale') return 'Overdue';
  if (!status.last_run?.finished_at) return '—';
  const next = new Date(new Date(status.last_run.finished_at).getTime() + status.interval_minutes * 60_000);
  return `About ${clock(next.toISOString())}`;
}

function Fact({ label, children, tone, muted }: {
  label: string;
  children: React.ReactNode;
  tone?: 'bad';
  muted?: boolean;
}) {
  return (
    <div className="border-b border-r px-3.5 py-2.5 last:border-r-0 lg:border-b-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-medium', tone === 'bad' && 'text-red-700', muted && 'font-normal text-muted-foreground')}>
        {children}
      </dd>
    </div>
  );
}

function RecentRuns({ runs, staleAfter }: { runs: EscalationRun[]; staleAfter: number }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Recent runs</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-2 font-medium">When</th>
              <th className="p-2 font-medium">Started by</th>
              <th className="p-2 text-right font-medium">To the HOS</th>
              <th className="p-2 text-right font-medium">To the HOD</th>
              <th className="p-2 text-right font-medium">Took</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{formatDateTime(r.started_at)}</td>
                <td className="p-2">{r.scheduled ? 'Schedule' : (r.started_by ?? 'Command line')}</td>
                <td className="p-2 text-right">{r.to_hos}</td>
                <td className="p-2 text-right">{r.to_hod}</td>
                <td className={cn('p-2 text-right', r.outcome === 'finished' ? 'text-muted-foreground' : 'font-medium text-red-700')}>
                  {r.outcome === 'finished' ? `${r.seconds}s` : OUTCOME[r.outcome]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {runs.some((r) => r.error) && (
        <p className="mt-2 text-xs text-red-700">Latest failure: {runs.find((r) => r.error)?.error}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">The card turns red if no run starts for {staleAfter} minutes, or if runs fail.</p>
    </div>
  );
}

function PreviewDialog({ open, onClose, onRun, running }: {
  open: boolean;
  onClose: () => void;
  onRun: () => void;
  running: boolean;
}) {
  // Read fresh each time it opens, so the list is what a run now would move.
  const { data, isLoading, error } = useQuery({
    queryKey: ['escalations', 'preview'],
    queryFn: previewEscalations,
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What a run would move now</DialogTitle>
          <DialogDescription>Nothing has changed yet. Run now moves these and notifies, as the schedule would.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : error ? (
          <p className="text-sm text-destructive">The preview could not be loaded.</p>
        ) : !data?.count ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing is due to climb.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm" aria-label="Tickets that would climb">
              <tbody>
                {data.tickets.map((t) => (
                  <tr key={t.id} className="border-t first:border-t-0">
                    <td className="p-2 font-mono text-xs">{t.ticket_no}</td>
                    <td className="p-2 text-muted-foreground">{t.campus}</td>
                    <td className="p-2 text-right">
                      {ESCALATION_LEVEL[t.from_level].short} → <span className="font-medium">{ESCALATION_LEVEL[t.to_level].short}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogActions onCancel={onClose} onSubmit={onRun} pending={running} pendingLabel="Running…" submitLabel="Run now" />
      </DialogContent>
    </Dialog>
  );
}
