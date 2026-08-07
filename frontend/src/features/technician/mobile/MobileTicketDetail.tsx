import { useState } from 'react';
import {
  ChevronLeft, MessageSquare, ArrowUpCircle, Loader2,
  CheckCircle2, Clock, AlertTriangle, MapPin, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useMobileTicketDetail,
  useMobileTicketComments,
  useUpdateTicketStatus,
  useAddComment,
} from './useMobileTickets';
import type { Ticket } from '@/types';

const STATUS_TRANSITIONS: Record<string, { label: string; next: string; icon: React.ElementType; color: string }[]> = {
  assigned:    [{ label: 'Start Work',    next: 'in_progress', icon: ArrowUpCircle, color: 'bg-purple-600 text-white' }],
  open:        [{ label: 'Start Work',    next: 'in_progress', icon: ArrowUpCircle, color: 'bg-purple-600 text-white' }],
  in_progress: [
    { label: 'Put On Hold',   next: 'pending',  icon: Clock,         color: 'bg-orange-500 text-white' },
    { label: 'Mark Resolved', next: 'resolved', icon: CheckCircle2,  color: 'bg-green-600 text-white' },
  ],
  pending:  [{ label: 'Resume Work', next: 'in_progress', icon: ArrowUpCircle, color: 'bg-purple-600 text-white' }],
  resolved: [],
  closed:   [],
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  open:        { label: 'Open',        color: 'bg-blue-100 text-blue-700' },
  assigned:    { label: 'Assigned',    color: 'bg-yellow-100 text-yellow-700' },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-700' },
  pending:     { label: 'On Hold',     color: 'bg-orange-100 text-orange-700' },
  resolved:    { label: 'Resolved',    color: 'bg-green-100 text-green-700' },
  closed:      { label: 'Closed',      color: 'bg-gray-100 text-gray-600' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Status action buttons ─────────────────────────────────────────────────────

interface StatusActionProps {
  ticketId: number;
  status: string;
  isOnline: boolean;
}

function StatusActions({ ticketId, status, isOnline }: StatusActionProps) {
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const { mutate, isPending } = useUpdateTicketStatus(ticketId);
  const transitions = STATUS_TRANSITIONS[status] ?? [];

  const handleAction = (next: string) => {
    if (!isOnline) {
      toast.error('You are offline. Try again when connected.');
      return;
    }
    if (next === 'pending') { setReasonFor(next); return; }
    mutate(
      { status: next, reason: '' },
      {
        onSuccess: () => toast.success(`Ticket marked as ${next.replace('_', ' ')}`),
        onError:   () => toast.error('Failed to update status. Try again.'),
      }
    );
  };

  const submitWithReason = () => {
    if (!reasonFor) return;
    mutate(
      { status: reasonFor, reason: reason.trim() || 'On hold' },
      {
        onSuccess: () => { toast.success('Ticket put on hold'); setReasonFor(null); setReason(''); },
        onError:   () => toast.error('Failed to update status.'),
      }
    );
  };

  if (transitions.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {transitions.map(t => (
          <button
            key={t.next}
            disabled={isPending || !isOnline}
            onClick={() => handleAction(t.next)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 active:opacity-80',
              t.color
            )}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <t.icon className="h-4 w-4" />}
            {t.label}
          </button>
        ))}
      </div>

      {reasonFor && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-orange-800">Why is this ticket on hold?</p>
          <textarea
            className="w-full rounded-lg border border-orange-200 bg-white p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
            rows={3}
            placeholder="Waiting for parts, awaiting requester response…"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setReasonFor(null); setReason(''); }}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground"
            >
              Cancel
            </button>
            <button
              disabled={isPending}
              onClick={submitWithReason}
              className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comment input ─────────────────────────────────────────────────────────────

function CommentBox({ ticketId, isOnline }: { ticketId: number; isOnline: boolean }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const { mutate, isPending } = useAddComment(ticketId);

  const submit = () => {
    if (!body.trim()) return;
    if (!isOnline) { toast.error('You are offline. Comment not sent.'); return; }
    mutate(body.trim(), {
      onSuccess: () => { toast.success('Comment added'); setBody(''); setOpen(false); },
      onError:   () => toast.error('Failed to add comment.'),
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 py-3 px-4 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        <MessageSquare className="h-4 w-4" />
        Add a comment…
      </button>
    );
  }

  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      <textarea
        autoFocus
        rows={4}
        placeholder="Add an update or note…"
        value={body}
        onChange={e => setBody(e.target.value)}
        className="w-full text-sm resize-none border-0 outline-none bg-transparent"
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); setBody(''); }} className="px-4 py-2 text-sm text-muted-foreground">
          Cancel
        </button>
        <button
          disabled={!body.trim() || isPending}
          onClick={submit}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40"
        >
          {isPending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ── Comments list ─────────────────────────────────────────────────────────────

function CommentsList({ ticketId }: { ticketId: number }) {
  const { data: comments = [], isLoading } = useMobileTicketComments(ticketId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-white border border-border animate-pulse" />)}
      </div>
    );
  }

  if (comments.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
        Comments ({comments.length})
      </p>
      {comments.map(c => (
        <div key={c.id} className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-foreground">
              {c.author?.full_name || c.author?.username || 'Unknown'}
            </span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main detail view ──────────────────────────────────────────────────────────

interface Props {
  ticket: Ticket;
  onBack: () => void;
  isOnline: boolean;
}

export function MobileTicketDetail({ ticket, onBack, isOnline }: Props) {
  const { data: detail } = useMobileTicketDetail(ticket.id);
  const t = detail ?? ticket;
  const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.open;
  const priorityName = (t.priority as unknown as { name?: string })?.name ?? '—';
  const isBreaching = (t as unknown as { is_breaching?: boolean }).is_breaching;

  const location = t.location as unknown as {
    facility_type?: { name?: string };
    facility?: { name?: string };
    values?: Record<string, string>;
  } | null;
  const locationLine = [
    location?.facility?.name,
    location?.facility_type?.name,
    location?.values && Object.values(location.values).filter(Boolean).join(', '),
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground active:bg-gray-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-mono text-muted-foreground">{t.ticket_no}</p>
            {isBreaching && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
          </div>
          <p className="text-sm font-semibold truncate">
            {(t.service_item as unknown as { name?: string })?.name ?? t.description}
          </p>
        </div>
        <span className={cn('text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0', st.color)}>
          {st.label}
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* SLA breach banner */}
        {isBreaching && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 font-medium">SLA breached — resolution overdue</p>
          </div>
        )}

        {/* Escalation warning */}
        {t.current_level && t.current_level !== 'technician' && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 font-medium">
              Escalated to {t.current_level.toUpperCase()}
            </p>
          </div>
        )}

        {/* Meta grid */}
        <div className="bg-white rounded-xl border border-border divide-y divide-border/70">
          {[
            { label: 'Priority',  value: priorityName },
            { label: 'Section',   value: (t.section as unknown as { name?: string })?.name ?? '—' },
            { label: 'Raised by', value: (t.raised_by as unknown as { full_name?: string; username?: string })?.full_name ?? (t.raised_by as unknown as { username?: string })?.username ?? '—' },
            { label: 'Created',   value: new Date(t.created_at).toLocaleString() },
            ...(t.resolution_due_at ? [{ label: 'Due by', value: new Date(t.resolution_due_at).toLocaleString() }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-medium text-foreground text-right max-w-[60%]">{value}</span>
            </div>
          ))}
        </div>

        {/* Location card */}
        {locationLine && (
          <div className="bg-white rounded-xl border border-border p-4 flex items-start gap-3">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">Location</p>
              <p className="text-sm text-foreground">{locationLine}</p>
            </div>
          </div>
        )}

        {/* Description */}
        {t.description && (
          <div className="bg-white rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Description</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{t.description}</p>
          </div>
        )}

        {/* Status actions */}
        <StatusActions ticketId={t.id} status={t.status} isOnline={isOnline} />

        {/* Existing comments */}
        <CommentsList ticketId={t.id} />

        {/* Add comment */}
        <CommentBox ticketId={t.id} isOnline={isOnline} />
      </div>
    </div>
  );
}
