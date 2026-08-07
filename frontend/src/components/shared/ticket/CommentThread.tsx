import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { Ticket } from '@/types';
import type { TicketComment } from '@/lib/api/tickets';
import { getComments, addComment } from '@/lib/api/tickets';
import { formatDate } from '@/utils/date';
import { ticketCommentSchema, type TicketCommentFormValues } from '@/utils/ticketValidation';

// ─── Comment cache ─────────────────────────────────────────────────────────

type CachedComments = { data: TicketComment[]; fetchedAt: number };
const CACHE = new Map<number, CachedComments>();
const TTL_MS = 60_000;
const STORAGE_KEY = 'resolver_ticket_comments_cache_v2';
const MAX_ENTRIES = 100;

function loadCache() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, CachedComments>;
    Object.entries(obj).forEach(([k, v]) => {
      const id = Number(k);
      if (!Number.isNaN(id)) CACHE.set(id, v);
    });
  } catch { /* ignore */ }
}

function saveCache() {
  try {
    if (CACHE.size > MAX_ENTRIES) {
      const sorted = Array.from(CACHE.entries()).sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
      sorted.slice(0, sorted.length - MAX_ENTRIES).forEach(([k]) => CACHE.delete(k));
    }
    const obj: Record<number, CachedComments> = {};
    CACHE.forEach((v, k) => { obj[k] = v; });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

function setCache(ticketId: number, data: TicketComment[]) {
  CACHE.set(ticketId, { data, fetchedAt: Date.now() });
  saveCache();
}

try { loadCache(); } catch { /* ignore */ }

// ─── CommentThread ──────────────────────────────────────────────────────────

interface CommentThreadProps {
  ticket: Ticket;
  /** When true, suppresses the comment input regardless of ticket status.
   *  Use for view-only roles (e.g. manager) or terminal statuses. */
  readOnly?: boolean;
  hideHeader?: boolean;
  onCommentAdded?: () => void;
  /** The viewer's role — internal comments are hidden from 'user' (requester). */
  viewerRole?: string;
  /** The viewer's user id — used for the assigned-technician comment gate. */
  viewerId?: number;
}

function getInitials(name?: string) {
  if (!name) return 'U';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function CommentThreadInner({ ticket, readOnly = false, hideHeader = false, onCommentAdded, viewerRole, viewerId }: CommentThreadProps) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [postVisibility, setPostVisibility] = useState<'public' | 'internal'>('public');
  const [loadingComments, setLoadingComments] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mirror of the server-side comment gate (B1): comments open once a
  // technician is assigned and close with the ticket; among technicians only
  // the assignee may post (unless they raised the ticket themselves).
  const isUnassigned = ticket.assigned_to == null;
  const isOtherTechnician =
    viewerRole === 'technician' &&
    viewerId != null &&
    ticket.assigned_to?.id !== viewerId &&
    ticket.raised_by_id !== viewerId;
  const disabledHint = readOnly
    ? 'Comments are view-only for your role.'
    : ticket.status === 'closed'
      ? 'This ticket is closed. Comments are disabled.'
      : isUnassigned
        ? 'Comments open once a technician is assigned.'
        : isOtherTechnician
          ? 'Only the assigned technician may comment on this ticket.'
          : null;
  const isClosed = disabledHint != null;

  const form = useForm<TicketCommentFormValues>({
    resolver: zodResolver(ticketCommentSchema),
    defaultValues: { comment: '' },
  });

  useEffect(() => {
    let mounted = true;

    async function fetchComments() {
      const cached = CACHE.get(ticket.id);
      const now = Date.now();

      if (cached && now - cached.fetchedAt < TTL_MS) {
        setComments(cached.data);
        setLoadingComments(false);
        return;
      }

      if (cached) {
        setComments(cached.data);
        setLoadingComments(true);
        try {
          const res = await getComments(ticket.id);
          if (!mounted) return;
          setComments(res.results);
          setCache(ticket.id, res.results);
        } catch { /* stale cache stays */ }
        finally { if (mounted) setLoadingComments(false); }
        return;
      }

      setLoadingComments(true);
      try {
        const res = await getComments(ticket.id);
        if (!mounted) return;
        setComments(res.results);
        setCache(ticket.id, res.results);
      } catch {
        if (mounted) setComments([]);
      } finally {
        if (mounted) setLoadingComments(false);
      }
    }

    fetchComments();
    return () => { mounted = false; };
  }, [ticket.id]);

  async function handleSubmit(values: TicketCommentFormValues) {
    setIsSubmitting(true);
    try {
      await addComment(ticket.id, values.comment, postVisibility);
      toast.success('Comment added');
      form.reset();
      const res = await getComments(ticket.id);
      setComments(res.results);
      setCache(ticket.id, res.results);
      onCommentAdded?.();
    } catch {
      toast.error('Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {!hideHeader && <h3 className="text-sm font-semibold">Comments</h3>}

      <div className="space-y-3">
        {loadingComments ? (
          <>
            {[0, 1].map((i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-muted/40 border">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
              </div>
            ))}
          </>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No comments yet.</p>
          </div>
        ) : (
          comments
            .filter(c => viewerRole === 'user' ? c.visibility !== 'internal' : true)
            .map((comment) => (
            <div key={comment.id} className={`flex gap-3 p-4 rounded-lg border ${comment.visibility === 'internal' ? 'bg-amber-50/60 border-amber-200' : 'bg-muted/40'}`}>
              <Avatar className="h-8 w-8 mt-0.5 shrink-0">
                <AvatarFallback className="text-xs">{getInitials(comment.author.full_name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium">{comment.author.full_name}</span>
                  {comment.visibility === 'internal' && viewerRole !== 'user' && (
                    <span className="text-[10px] font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-px">Internal</span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {!isClosed ? (
        <div className="pt-3 border-t">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea {...field} placeholder="Add a comment…" rows={3} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center justify-between gap-2">
                {viewerRole !== 'user' && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setPostVisibility('public')}
                      className={`px-2 py-1 rounded transition-colors ${postVisibility === 'public' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setPostVisibility('internal')}
                      className={`px-2 py-1 rounded transition-colors ${postVisibility === 'internal' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      Internal
                    </button>
                  </div>
                )}
                <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5">
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </form>
          </Form>
        </div>
      ) : (
        <p className="pt-3 border-t text-sm text-muted-foreground italic text-center py-2">
          {disabledHint}
        </p>
      )}
    </div>
  );
}

export const CommentThread = React.memo(
  CommentThreadInner,
  (prev, next) =>
    prev.ticket.id === next.ticket.id &&
    prev.ticket.updated_at === next.ticket.updated_at &&
    prev.readOnly === next.readOnly &&
    prev.viewerRole === next.viewerRole &&
    prev.viewerId === next.viewerId &&
    prev.onCommentAdded === next.onCommentAdded,
);
