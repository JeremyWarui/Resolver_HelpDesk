import { useMemo } from 'react';
import { MessageSquare, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RatingStars } from '@/components/shared/ticket/RatingWidget';
import { useFeedback } from '@/hooks/tickets/useFeedback';
import type { UserRole } from '@/types';
import { formatDateTimeLocal } from '@/utils/date';

const SUBTITLES: Partial<Record<UserRole, string>> = {
  technician: 'Ratings and comments on tickets you resolved',
  hos: 'Feedback across your section(s)',
  hod: 'Feedback across your department',
  manager: 'Feedback across your department',
  admin: 'Feedback across all tickets',
};

/** Row layout follows the Catalogue admin page's item-row pattern (name/meta
 * on the left, detail on the right, in a bordered card list) rather than the
 * canonical DataTable — feedback is a flat, non-hierarchical read-only list,
 * and this is the closest existing visual precedent for it. Scope (own vs
 * section vs department) is entirely server-derived — no params are sent. */
export function FeedbackTab({ role }: { role: UserRole }) {
  const { feedback, loading, error } = useFeedback();

  // Summary is derived from the rows on screen rather than from
  // /analytics/quality/, whose csat is computed over a 30-day window. Two
  // averages over different populations sitting on one page is worse than no
  // average at all.
  const summary = useMemo(() => {
    if (feedback.length === 0) return null;
    const total = feedback.reduce((sum, r) => sum + r.rating, 0);
    const histogram = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: feedback.filter((r) => r.rating === star).length,
    }));
    return {
      average: total / feedback.length,
      count: feedback.length,
      histogram,
    };
  }, [feedback]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Feedback</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {SUBTITLES[role] ?? 'Submitted ratings and comments'}
        </p>
      </div>

      {summary && (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-3xl font-semibold text-gray-900 tabular-nums">
              {summary.average.toFixed(1)}
            </span>
            <div>
              <RatingStars rating={Math.round(summary.average)} />
              <p className="text-xs text-gray-500 mt-1">
                {summary.count} rating{summary.count === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            {summary.histogram.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-3 tabular-nums">{star}</span>
                <Star className="h-3 w-3 text-amber-400 shrink-0" />
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${(count / summary.count) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-4 text-right tabular-nums">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="p-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center">
              Failed to load feedback.
            </p>
          ) : feedback.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-gray-100 mb-3">
                <MessageSquare className="h-6 w-6 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 font-medium">No feedback yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Ratings and comments will appear here once requesters submit them.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Ticket meta left, stars right, comment beneath only when there
                  is one. The comment used to own a fixed half of every card,
                  so most rows spent half their width saying "No comment left". */}
              {feedback.map((row) => (
                <div
                  key={row.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {row.ticket_no} · {row.service_item}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {row.assigned_to
                          ? (row.assigned_to.full_name || row.assigned_to.username)
                          : 'Unassigned'}{' '}
                        · {row.resolved_at
                          ? `resolved ${formatDateTimeLocal(row.resolved_at)}`
                          : formatDateTimeLocal(row.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <RatingStars rating={row.rating} />
                    </div>
                  </div>

                  {row.comment && (
                    <p className="text-sm text-gray-600 whitespace-pre-wrap mt-2.5 pl-3 border-l-2 border-gray-200">
                      {row.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default FeedbackTab;
