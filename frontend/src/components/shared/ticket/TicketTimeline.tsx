// The ticket's activity trail: icon, label and actor, with the time on the
// right and a date pill wherever the day changes.

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ROLE_LABELS } from '@/constants/roles';
import type { TicketEventType, TicketTimelineEvent, UserRole } from '@/types';
import {
  Plus, UserPlus, ArrowRightLeft, ArrowRight,
  MessageCircle, ChevronsUp,
  CheckCheck, Archive, Undo2, Star,
  Flag, AlertCircle, Activity,
} from 'lucide-react';

interface TicketTimelineProps {
  events: TicketTimelineEvent[];
  loading?: boolean;
  className?: string;
  hideHeader?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function actorName(actor?: { full_name?: string | null; username: string }): string {
  if (!actor) return 'System';
  return (actor.full_name ?? '').trim() || actor.username;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today    = new Date(now.getFullYear(),   now.getMonth(),   now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const eventDay  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (+eventDay === +today)     return 'Today';
  if (+eventDay === +yesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Event config ──────────────────────────────────────────────────────────────

type EventConfig = {
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colorVar: string;
  label: string;
};

const EVENT_CONFIG: Record<TicketEventType, EventConfig> = {
  created:          { Icon: Plus,           colorVar: '--status-assigned',  label: 'Ticket opened'    },
  assigned:         { Icon: UserPlus,       colorVar: '--status-assigned',  label: 'Assigned'         },
  reassigned:       { Icon: ArrowRightLeft, colorVar: '--status-assigned',  label: 'Reassigned'       },
  status_changed:   { Icon: ArrowRight,     colorVar: '--status-progress',  label: 'Status changed'   },
  comment:          { Icon: MessageCircle,  colorVar: '--status-assigned',  label: 'Comment added'    },
  comment_added:    { Icon: MessageCircle,  colorVar: '--status-assigned',  label: 'Comment added'    },
  escalated:        { Icon: ChevronsUp,     colorVar: '--status-escalated', label: 'Escalated'        },
  resolved:         { Icon: CheckCheck,     colorVar: '--status-resolved',  label: 'Resolved'         },
  closed:           { Icon: Archive,        colorVar: '--status-closed',    label: 'Closed'           },
  reopened:         { Icon: Undo2,          colorVar: '--status-assigned',  label: 'Reopened'         },
  rated:            { Icon: Star,           colorVar: '--status-resolved',  label: 'Rated'            },
  priority_changed: { Icon: Flag,           colorVar: '--status-progress',  label: 'Priority changed' },
  sla_breach:       { Icon: AlertCircle,    colorVar: '--status-escalated', label: 'SLA breached'     },
};

function humanStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildSubtext(event: TicketTimelineEvent): string {
  const { event_type, data, actor } = event;
  const name = actorName(actor);
  switch (event_type) {
    case 'created':
      return `by ${name}`;
    case 'assigned': {
      const to = data?.to as string | undefined;
      return to ? `to ${to} · by ${name}` : `by ${name}`;
    }
    case 'reassigned': {
      const to = data?.to as string | undefined;
      return to ? `to ${to}` : name;
    }
    case 'status_changed': {
      const from = data?.from as string | undefined;
      const to   = data?.to   as string | undefined;
      return from && to
        ? `${humanStatus(from)} → ${humanStatus(to)} · by ${name}`
        : `by ${name}`;
    }
    case 'resolved':
    case 'closed':
    case 'reopened':
      return `by ${name}`;
    case 'escalated': {
      const from   = data?.from as string | undefined;
      const to     = data?.to   as string | undefined;
      const lu     = data?.level_user as { full_name?: string | null; username?: string } | undefined;
      const luName = lu ? ((lu.full_name ?? '').trim() || lu.username || '') : '';
      const levels = from && to ? `${ROLE_LABELS[from as UserRole] ?? from} → ${ROLE_LABELS[to as UserRole] ?? to}` : '';
      return [levels, luName ? `now with ${luName}` : ''].filter(Boolean).join(' · ');
    }
    case 'rated': {
      const rating = Number(data?.to ?? 0);
      return `${name} · ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
    }
    default:
      return name;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DateChip({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-3 first:mt-0">
      <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

// Events whose `note` (TicketLog.reason) is a message someone typed: progress
// notes, hold reasons, resolution notes and the HOS's handover note.
const NOTE_EVENT_TYPES: TicketEventType[] = [
  'status_changed', 'resolved', 'closed', 'reopened', 'assigned', 'reassigned',
];

function EventRow({
  event,
  isLast,
}: {
  event: TicketTimelineEvent;
  isLast: boolean;
}) {
  const cfg       = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.status_changed;
  const { Icon, colorVar } = cfg;
  const isComment = event.event_type === 'comment' || event.event_type === 'comment_added';
  const name      = actorName(event.actor);
  const label     = isComment ? `Comment added` : cfg.label;
  const subtext   = isComment ? name : buildSubtext(event);
  const showNote  = !!event.note && NOTE_EVENT_TYPES.includes(event.event_type);

  return (
    <div className={cn('flex items-start gap-3', isLast ? '' : 'pb-2')}>
      {/* Icon + connector */}
      <div className="flex flex-col items-center self-stretch shrink-0 pt-0.5" style={{ width: 22 }}>
        <div
          className="flex items-center justify-center w-[22px] h-[22px] rounded-full shrink-0"
          style={{ border: `1.5px solid var(${colorVar})`, backgroundColor: 'transparent' }}
        >
          <Icon className="h-3 w-3" style={{ color: `var(${colorVar})` }} />
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{ minHeight: 14, backgroundColor: `color-mix(in srgb, var(${colorVar}) 20%, #e5e7eb)` }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-baseline gap-1.5">
            <span className="text-sm text-foreground">{label}</span>
            <span className="text-sm text-muted-foreground truncate">· {subtext}</span>
          </div>
          <span className="text-xs text-muted-foreground/70 shrink-0 tabular-nums">
            {formatTime(event.created_at)}
          </span>
        </div>
        {showNote && (
          <p className="mt-1 text-sm text-muted-foreground border-l-2 border-border pl-2.5 whitespace-pre-wrap">
            {event.note}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TicketTimeline({
  events,
  loading = false,
  className,
  hideHeader = false,
}: TicketTimelineProps) {
  // No role filtering here. The server already decides what each caller may
  // read: a requester's log feed omits the staff comment events, and the
  // comment endpoint refuses them outright.

  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        {!hideHeader && <h3 className="text-sm font-semibold">Activity</h3>}
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton className="w-7 h-7 rounded-full shrink-0" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3 w-14 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-10 text-muted-foreground gap-2', className)}>
        <Activity className="h-7 w-7 opacity-25" />
        <p className="text-sm">No activity yet.</p>
      </div>
    );
  }

  const items: React.ReactNode[] = [];
  let lastDay = '';

  events.forEach((event, idx) => {
    const day = dayLabel(event.created_at);
    if (day !== lastDay) {
      items.push(<DateChip key={`chip-${day}`} label={day} />);
      lastDay = day;
    }
    items.push(<EventRow key={event.id} event={event} isLast={idx === events.length - 1} />);
  });

  return (
    <div className={className}>
      {!hideHeader && (
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Activity
        </h3>
      )}
      <div>{items}</div>
    </div>
  );
}
