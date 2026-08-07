import { MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RatingStars } from '@/components/shared/ticket/RatingWidget';
import { useFeedback } from '@/hooks/tickets/useFeedback';
import type { UserRole } from '@/types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-KE', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

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

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Feedback</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {SUBTITLES[role] ?? 'Submitted ratings and comments'}
        </p>
      </div>

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
              {feedback.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {row.ticket_no} · {row.service_item}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {row.assigned_to
                        ? (row.assigned_to.full_name || row.assigned_to.username)
                        : 'Unassigned'}{' '}
                      · {row.section}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {row.resolved_at
                        ? `Resolved ${formatDate(row.resolved_at)}`
                        : formatDate(row.created_at)}
                    </p>
                    <div className="mt-2">
                      <RatingStars rating={row.rating} />
                    </div>
                  </div>
                  <div className="sm:border-l sm:border-gray-100 sm:pl-4">
                    {row.comment ? (
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">
                        &ldquo;{row.comment}&rdquo;
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No comment left.</p>
                    )}
                  </div>
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
