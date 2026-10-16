import { useMemo } from 'react';
import { MessageSquare, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RatingStars } from '@/components/shared/ticket/RatingWidget';
import { useFeedback } from '@/hooks/tickets/useTickets';
import type { TicketFeedbackRow } from '@/lib/api/tickets';
import type { UserRole } from '@/types';
import { formatDateTimeLocal } from '@/utils/date';

const SUBTITLES: Partial<Record<UserRole, string>> = {
  technician: 'What requesters said about the jobs assigned to you',
  hos: 'Feedback across your campus',
  hod: 'Feedback across your campus',
  manager: 'Feedback across every campus',
  admin: 'Feedback across every campus',
};

/**
 * Requesters' ratings of finished work: the score on the left, what they wrote
 * on the right. Scope is decided by the server; no params are sent.
 */
function FeedbackTab({ role }: { role: UserRole }) {
  const { feedback, loading, error } = useFeedback();

  // Read from the rows on screen, so the average and the list cover the same ratings.
  const summary = useMemo(() => {
    if (feedback.length === 0) return null;
    const total = feedback.reduce((sum, r) => sum + r.rating, 0);
    return {
      average: total / feedback.length,
      count: feedback.length,
      commented: feedback.filter((r) => r.comment.trim()).length,
      histogram: [5, 4, 3, 2, 1].map((star) => ({
        star,
        count: feedback.filter((r) => r.rating === star).length,
      })),
    };
  }, [feedback]);

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-muted/30 p-3 sm:p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        {SUBTITLES[role] ?? 'Submitted ratings and comments'}
      </p>

      {error ? (
        <Card className="p-6 text-center text-sm text-destructive">Failed to load feedback.</Card>
      ) : !loading && !summary ? (
        <Card className="text-center py-16">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-gray-100 mx-auto mb-3">
            <MessageSquare className="h-6 w-6 text-gray-300" />
          </div>
          <p className="text-sm text-gray-500 font-medium">No feedback yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Ratings and comments will appear here once requesters submit them.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
          <Card aria-label="Ratings" className="lg:sticky lg:top-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ratings</CardTitle>
              <CardDescription>How requesters scored the fix</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!summary ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <span className="text-5xl font-semibold text-gray-900 tabular-nums">
                      {summary.average.toFixed(1)}
                    </span>
                    <div className="space-y-1">
                      <RatingStars rating={Math.round(summary.average)} />
                      <p className="text-xs text-gray-500">
                        {summary.count} rating{summary.count === 1 ? '' : 's'}, {summary.commented} with a
                        comment
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {summary.histogram.map(({ star, count }) => (
                      <div key={star} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-3 tabular-nums">{star}</span>
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full"
                            style={{ width: `${(count / summary.count) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-6 text-right tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card aria-label="Comments">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Comments</CardTitle>
              <CardDescription>What requesters wrote, newest first</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <ul className="divide-y">
                  {feedback.map((row) => (
                    <FeedbackItem key={row.id} row={row} role={role} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/** One rated job: what it was, its stars, and the comment if there is one. */
function FeedbackItem({ row, role }: { row: TicketFeedbackRow; role: UserRole }) {
  // A technician's rows are all their own work, so naming them would say nothing.
  const who =
    role === 'technician'
      ? `${row.trade} · ${row.campus}`
      : row.assigned_to
        ? row.assigned_to.full_name || row.assigned_to.username
        : 'Unassigned';
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {row.ticket_no} · {row.service_item}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {who} · rated {formatDateTimeLocal(row.created_at)}
          </p>
        </div>
        <RatingStars rating={row.rating} className="shrink-0" />
      </div>
      {row.comment.trim() ? (
        <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2 pl-3 border-l-2 border-amber-300">
          {row.comment}
        </p>
      ) : (
        <p className="text-xs text-gray-400 italic mt-2">No comment left</p>
      )}
    </li>
  );
}

export default FeedbackTab;
