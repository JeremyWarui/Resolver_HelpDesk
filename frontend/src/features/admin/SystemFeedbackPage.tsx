import { useState } from 'react';
import { Check, MessagesSquare, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { FEEDBACK_CATEGORIES } from '@/constants/systemFeedback';
import {
  useMarkSystemFeedbackReviewed,
  useNewSystemFeedbackCount,
  useSystemFeedbackList,
} from '@/hooks/useSystemFeedback';
import { ROLE_LABELS } from '@/constants/roles';
import { timeAgo } from '@/utils/date';
import { cn } from '@/lib/utils';
import type { FilterPill, SystemFeedbackEntry, UserRole } from '@/types';

type Status = 'new' | 'reviewed' | 'all';

/** What people have said about the system, newest first. The admin reads it here
 *  and marks each one reviewed once it has been acted on or answered. */
export default function SystemFeedbackPage() {
  const [status, setStatus] = useState<Status>('new');
  const newCount = useNewSystemFeedbackCount(true);
  const { entries, total, loading } = useSystemFeedbackList(status === 'all' ? undefined : status);
  const mark = useMarkSystemFeedbackReviewed();

  const pills: FilterPill[] = [
    { key: 'new', label: newCount ? `New (${newCount})` : 'New' },
    { key: 'reviewed', label: 'Reviewed' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="p-4 sm:p-6">
      <Card className="overflow-hidden max-w-4xl">
        <div className="px-5 sm:px-6 pt-5 pb-3">
          <p className="text-sm font-semibold text-gray-700">System feedback</p>
          <p className="text-xs text-gray-400 mt-0.5">
            What people have said about Resolver itself, sent from the sidebar. Ratings of a fix
            are on each ticket instead.
          </p>
        </div>
        <div className="px-5 sm:px-6 pb-3">
          <FilterPills pills={pills} active={status} onChange={(k) => setStatus(k as Status)} />
        </div>

        <div className="border-t border-gray-100">
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <MessagesSquare className="h-8 w-8 text-gray-300" aria-hidden />
              <p className="text-sm font-medium text-gray-600">
                {status === 'new' ? 'Nothing new to review' : 'No feedback here yet'}
              </p>
              <p className="text-xs text-gray-400">Anything people send from the sidebar lands here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <FeedbackEntry
                  key={entry.id}
                  entry={entry}
                  busy={mark.isPending && mark.variables?.id === entry.id}
                  onToggle={() => mark.mutate({ id: entry.id, reviewed: !entry.reviewed })}
                />
              ))}
            </ul>
          )}
          {total > entries.length && (
            <p className="px-6 py-3 text-center text-xs text-gray-400 border-t border-gray-100">
              Showing the newest {entries.length} of {total}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function FeedbackEntry({ entry, busy, onToggle }: {
  entry: SystemFeedbackEntry;
  busy: boolean;
  onToggle: () => void;
}) {
  const category = FEEDBACK_CATEGORIES.find((c) => c.key === entry.category);
  const Icon = category?.icon ?? MessagesSquare;
  const role = ROLE_LABELS[entry.author_role as UserRole] ?? entry.author_role;

  return (
    <li aria-label={`${category?.label ?? entry.category} from ${entry.author_name}`} className="px-5 sm:px-6 py-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row">
        <span
          className={cn(
            'inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
            category?.tint ?? 'bg-gray-50 text-gray-700 border-gray-200',
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {category?.label ?? entry.category}
        </span>
        <div className="min-w-0 flex-1 w-full">
          <p className={cn('text-sm whitespace-pre-wrap break-words', entry.reviewed ? 'text-gray-500' : 'text-gray-900')}>
            {entry.message}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{entry.author_name}</span>
            {' · '}{role}
            {entry.author_campus && <>{' · '}{entry.author_campus}</>}
            {entry.page && <>{' · from '}<span className="font-mono break-all">{entry.page}</span></>}
            {' · '}{timeAgo(entry.created_at)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={busy}
          onClick={onToggle}
        >
          {entry.reviewed ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {entry.reviewed ? 'Mark as new' : 'Mark reviewed'}
        </Button>
      </div>
    </li>
  );
}
