import { useState } from 'react';
import { MessageSquare, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import RangeSelector from '@/components/shared/data/RangeSelector';
import { RatingStars } from '@/components/shared/ticket/RatingWidget';
import { useFeedback, useFeedbackSummary } from '@/hooks/tickets/useTickets';
import type { FeedbackWindow, TicketFeedbackRow } from '@/lib/api/tickets';
import { RANGES, type RangeKey } from '@/constants/analytics';
import type { UserRole } from '@/types';
import { formatDateTimeLocal } from '@/utils/date';
import { cn } from '@/lib/utils';

const SUBTITLES: Partial<Record<UserRole, string>> = {
  technician: 'What requesters said about the jobs assigned to you',
  hos: 'Feedback across your campus',
  hod: 'Feedback across your campus',
  manager: 'Feedback across every campus',
  admin: 'Feedback across every campus',
};

/** The last `days` days up to now, fixed at the moment the period is picked. */
function windowOf(days: number): FeedbackWindow {
  const to = new Date();
  return {
    date_from: new Date(to.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    date_to: to.toISOString(),
  };
}

/** What the period covers, said exactly: "Today" is the last 24 hours. */
const spanOf = (days: number) => (days === 1 ? 'the last 24 hours' : `the last ${days} days`);

/**
 * Requesters' ratings of finished work over a period, by when they were
 * rated: the figures on the left cover every rating in it, the comments on the
 * right load a page at a time, and a star narrows them. Scope is the server's.
 */
function FeedbackTab({ role }: { role: UserRole }) {
  const [range, setRange] = useState<RangeKey>('month');
  const [period, setPeriod] = useState(() => windowOf(RANGES.month.days));
  const [picked, setPicked] = useState<number | null>(null);
  const span = spanOf(RANGES[range].days);

  const { summary, loading: summaryLoading, error: summaryError } = useFeedbackSummary(period);
  // A star with no ratings left in the window is no filter at all.
  const star = picked && summary?.stars.find((s) => s.stars === picked)?.count ? picked : null;
  const list = useFeedback(period, star);

  function pickRange(next: RangeKey) {
    setRange(next);
    setPeriod(windowOf(RANGES[next].days));
    setPicked(null);
  }

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-muted/30 p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {SUBTITLES[role] ?? 'Submitted ratings and comments'}
        </p>
        <RangeSelector value={range} onChange={pickRange} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
        <Card aria-label="Ratings" className="lg:sticky lg:top-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ratings</CardTitle>
            <CardDescription>Rated in {span}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {summaryError ? (
              <p className="py-6 text-center text-sm text-destructive">Failed to load the figures.</p>
            ) : summaryLoading || !summary ? (
              <Skeleton className="h-40 w-full" />
            ) : summary.count === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No ratings in {span}.</p>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <span className="text-5xl font-semibold text-gray-900 tabular-nums">
                    {summary.average?.toFixed(1)}
                  </span>
                  <div className="space-y-1">
                    <RatingStars rating={Math.round(summary.average ?? 0)} />
                    <p className="text-xs text-gray-500">
                      {summary.count} rating{summary.count === 1 ? '' : 's'}, {summary.commented} with a
                      comment
                    </p>
                  </div>
                </div>
                <div className="space-y-1" role="group" aria-label="Show one star">
                  {summary.stars.map(({ stars, count }) => (
                    <button
                      key={stars}
                      type="button"
                      disabled={count === 0}
                      aria-pressed={star === stars}
                      aria-label={`${stars} star${stars === 1 ? '' : 's'}: ${count}`}
                      onClick={() => setPicked(star === stars ? null : stars)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
                        'hover:bg-amber-50 disabled:cursor-default disabled:hover:bg-transparent',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        star === stars && 'bg-amber-50 ring-1 ring-amber-300',
                      )}
                    >
                      <span className="text-xs text-gray-500 w-3 tabular-nums">{stars}</span>
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" aria-hidden />
                      <span className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <span
                          className="block h-full bg-amber-400 rounded-full"
                          style={{ width: `${(count / summary.count) * 100}%` }}
                        />
                      </span>
                      <span className="text-xs text-gray-500 w-6 text-right tabular-nums">{count}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400">Pick a star to read only those comments.</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card aria-label="Comments">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Comments</CardTitle>
            <CardDescription>
              {star ? `${star}-star ratings, newest first` : 'What requesters wrote, newest first'}
            </CardDescription>
            {star && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 w-fit gap-1 text-xs"
                onClick={() => setPicked(null)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Show every star
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {list.error ? (
              <p className="py-12 text-center text-sm text-destructive">Failed to load the comments.</p>
            ) : list.loading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : list.feedback.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-gray-100 mb-3">
                  <MessageSquare className="h-6 w-6 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 font-medium">No feedback in {span}</p>
                <p className="text-xs text-gray-400 mt-1">Pick a longer period to read older ratings.</p>
              </div>
            ) : (
              <>
                <ul className="divide-y">
                  {list.feedback.map((row) => (
                    <FeedbackItem key={row.id} row={row} role={role} />
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <p className="text-xs text-gray-500">
                    Showing {list.feedback.length} of {list.total}
                  </p>
                  {list.hasMore && (
                    <Button variant="outline" size="sm" onClick={list.loadMore} disabled={list.loadingMore}>
                      {list.loadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
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
