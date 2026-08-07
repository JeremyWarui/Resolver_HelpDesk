import { ArrowRight, Ticket as TicketIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TicketCard } from '@/components/shared/ticket/TicketCard';
import type { Ticket } from '@/types';

interface RecentTicketsCardProps {
  tickets: Ticket[];
  loading: boolean;
  onTicketClick?: (id: number) => void;
  onViewAll?: () => void;
}

export function RecentTicketsCard({ tickets, loading, onTicketClick, onViewAll }: RecentTicketsCardProps) {
  const displayed = tickets.slice(0, 5);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">Recent Activity</h2>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={onViewAll}
        >
          View All
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-md" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 rounded-lg border bg-background text-muted-foreground">
          <TicketIcon className="h-8 w-8 mb-2 opacity-20" />
          <p className="text-sm">No tickets yet</p>
          <p className="text-xs mt-1">Your requests will appear here once submitted</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              onClick={onTicketClick ? () => onTicketClick(t.id) : undefined}
              showSLA
            />
          ))}
        </div>
      )}
    </div>
  );
}
