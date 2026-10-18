import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** The frame the Escalated and Pending Work pages share: a heading, then a
 *  skeleton while loading, an empty card when there is nothing, else the page. */
export default function WorkQueueShell({
  title, subtitle, embedded, loading, empty, children,
}: {
  title: string;
  subtitle: string;
  /** Inside another page's tab: no heading or background of its own. */
  embedded: boolean;
  loading: boolean;
  /** Shown instead of `children` when the list is empty. */
  empty: { icon: LucideIcon; title: string; text: string } | null;
  children: ReactNode;
}) {
  return (
    <div className={embedded ? 'p-4 sm:p-5 space-y-4' : 'flex-1 overflow-y-auto bg-muted/30 p-4 space-y-4'}>
      {embedded ? (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      ) : (
        <div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : empty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <empty.icon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{empty.title}</p>
            <p className="text-sm text-muted-foreground">{empty.text}</p>
          </CardContent>
        </Card>
      ) : (
        children
      )}
    </div>
  );
}
