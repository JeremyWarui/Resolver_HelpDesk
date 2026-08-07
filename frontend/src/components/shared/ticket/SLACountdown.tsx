// SLACountdown — live SLA deadline countdown with a colour-shifting progress bar.
// Color shifts: ok (>50% remaining) → warning (10-50%) → breach (overdue/<10%).
// Used in the TicketTable sla variant and the TicketDetailPage sidebar.
//
// The progress bar fills left-to-right as time is consumed.
// Colour uses --sla-* tokens directly via inline style (shadcn Progress pins to bg-primary
// so we render the bar manually for dynamic colour support).

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

type SLAState = 'ok' | 'warning' | 'breach';

function getSLAState(remainingMs: number, totalMs: number): SLAState {
  if (remainingMs <= 0) return 'breach';
  const pct = remainingMs / totalMs;
  if (pct <= 0.1) return 'breach';
  if (pct <= 0.5) return 'warning';
  return 'ok';
}

function formatDuration(ms: number): string {
  if (ms <= 0) return 'Overdue';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const SLA_COLOR: Record<SLAState, string> = {
  ok:      'var(--sla-ok)',
  warning: 'var(--sla-warning)',
  breach:  'var(--sla-breach)',
};

export interface SLACountdownProps {
  dueDate: string | null | undefined;
  createdAt?: string;
  /** Explicitly set paused state. */
  isPaused?: boolean;
  /** Ticket status — automatically pauses when 'pending'. */
  status?: string;
  compact?: boolean;
  className?: string;
}

export function SLACountdown({ dueDate, createdAt, isPaused = false, status, compact = false, className }: SLACountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  // Paused when explicitly set OR when ticket is in pending status (SLA clock frozen)
  const effectivelyPaused = isPaused || status === 'pending';

  useEffect(() => {
    if (effectivelyPaused) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [effectivelyPaused]);

  if (!dueDate) {
    return <span className="text-xs text-muted-foreground">No SLA</span>;
  }

  if (effectivelyPaused) {
    if (compact) {
      return (
        <div className={cn('flex items-center gap-1.5', className)}>
          <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">Paused</span>
        </div>
      );
    }
    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">SLA</span>
          <span className="text-xs font-medium text-muted-foreground">Paused</span>
        </div>
      </div>
    );
  }

  const dueMs = new Date(dueDate).getTime();
  const startMs = createdAt ? new Date(createdAt).getTime() : dueMs - 86_400_000;
  const totalMs = Math.max(dueMs - startMs, 1);
  const remainingMs = dueMs - now;
  const consumed = Math.min(Math.max(((now - startMs) / totalMs) * 100, 0), 100);
  const state = getSLAState(remainingMs, totalMs);
  const color = SLA_COLOR[state];
  const label = formatDuration(remainingMs);

  const bar = (height: string) => (
    <div className={`w-full rounded-full bg-muted overflow-hidden ${height}`}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${consumed}%`, backgroundColor: color }}
      />
    </div>
  );

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1.5 min-w-[80px]', className)}>
        {bar('h-1.5')}
        <span
          className="text-[10px] font-medium whitespace-nowrap shrink-0 w-12 text-right"
          style={{ color }}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">SLA</span>
        <span className="text-xs font-semibold" style={{ color }}>
          {label}
        </span>
      </div>
      {bar('h-2')}
    </div>
  );
}
