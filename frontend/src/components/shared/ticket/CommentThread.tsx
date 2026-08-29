import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { addComment } from '@/lib/api/tickets';
import { useTicketComments } from '@/hooks/tickets/useTicketDetail';
import { formatDate } from '@/utils/date';
import { ticketCommentSchema, type TicketCommentFormValues } from '@/utils/validation';
import type { Ticket } from '@/types';

interface CommentThreadProps {
  ticket: Ticket;
  hideHeader?: boolean;
  onCommentAdded?: () => void;
  /** The viewer's role and id, for the assigned-technician gate. */
  viewerRole?: string;
  viewerId?: number;
}

function initials(name?: string) {
  if (!name) return 'U';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

/**
 * The staff working log on one ticket. The requester never reaches this
 * component; the gate below mirrors the server's, so a disabled input says why
 * rather than posting into a 403.
 */
function CommentThread({
  ticket,
  hideHeader = false,
  onCommentAdded,
  viewerRole,
  viewerId,
}: CommentThreadProps) {
  const queryClient = useQueryClient();
  const key = ['ticket-comments', ticket.id];
  const { comments, loading: isLoading } = useTicketComments(ticket.id);

  const post = useMutation({
    mutationFn: (body: string) => addComment(ticket.id, body),
    onSuccess: () => {
      toast.success('Comment added');
      form.reset();
      queryClient.invalidateQueries({ queryKey: key });
      onCommentAdded?.();
    },
    onError: () => toast.error('Failed to add comment'),
  });

  // Comments open once a technician is assigned and close with the ticket;
  // among technicians only the assignee may post.
  const isOtherTechnician =
    viewerRole === 'technician' && viewerId != null && ticket.assigned_to?.id !== viewerId;
  const disabledHint = ticket.status === 'closed'
      ? 'This ticket is closed. Comments are disabled.'
      : ticket.assigned_to == null
        ? 'Comments open once a technician is assigned.'
        : isOtherTechnician
          ? 'Only the assigned technician may comment on this ticket.'
          : null;

  const form = useForm<TicketCommentFormValues>({
    resolver: zodResolver(ticketCommentSchema),
    defaultValues: { comment: '' },
  });

  return (
    <div className="space-y-5">
      {!hideHeader && <h3 className="text-sm font-semibold">Comments</h3>}

      <div className="space-y-3">
        {isLoading ? (
          [0, 1].map((i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-muted/40 border">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            </div>
          ))
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No comments yet.</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-3 p-4 rounded-lg border bg-muted/40">
              <Avatar className="h-8 w-8 mt-0.5 shrink-0">
                <AvatarFallback className="text-xs">
                  {initials(comment.author.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium">{comment.author.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(comment.created_at)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {disabledHint ? (
        <p className="pt-3 border-t text-sm text-muted-foreground italic text-center py-2">
          {disabledHint}
        </p>
      ) : (
        <div className="pt-3 border-t">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => post.mutate(values.comment))}
              className="space-y-3"
            >
              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Add a comment…"
                        rows={3}
                        disabled={post.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center justify-end gap-2">
                <Button type="submit" size="sm" disabled={post.isPending} className="gap-1.5">
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}
    </div>
  );
}

export default CommentThread;
