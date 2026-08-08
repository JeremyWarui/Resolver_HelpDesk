import { useEffect, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { UserStatsCards } from '@/components/shared/data/StatCards';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import { TicketCreationWizard } from '@/components/shared/ticket/TicketCreationWizard';
import QuickActions, { type QuickActionItem } from './QuickActions';
import { AwaitingRatingBanner } from './AwaitingRatingBanner';
import { RatingModal } from './RatingModal';
import { useAuthStore } from '@/stores/authStore';
import { useUserDashboard } from '@/hooks/dashboard';
import { useTickets } from '@/hooks/tickets';
import type { Ticket } from '@/types';

interface UserDashboardProps {
  onNavigate?: (section: 'dashboard' | 'userTickets' | 'submitTicket' | 'settings') => void;
  onTicketSelect?: (id: number) => void;
}

type QuickStart = {
  subSectionCode?: string;
  item?: QuickActionItem;
} | undefined;

// A preview, not a second copy of My Tickets — that page is in the sidebar and
// owns the filtering. Ten rows is enough to see what is in flight.
const RECENT_LIMIT = 10;

const UserDashboard = ({ onNavigate, onTicketSelect }: UserDashboardProps) => {
  const queryClient = useQueryClient();
  const userData = useAuthStore((s) => s.user);
  const { loading: dashLoading, refetch } = useUserDashboard();

  const { tickets, totalTickets, loading: ticketsLoading } = useTickets({
    mine: 1,
    page_size: RECENT_LIMIT,
  });

  const [wizardOpen, setWizardOpen] = useState(false);
  const [quickStart, setQuickStart] = useState<QuickStart>(undefined);
  const [rating, setRating] = useState<Ticket | null>(null);

  const welcomeName = [userData?.first_name, userData?.last_name].filter(Boolean).join(' ') ||
    userData?.username ||
    'User';

  useEffect(() => {
    refetch();
  }, [refetch]);

  function handleServiceSelect(ctx: { subSectionCode: string; item?: QuickActionItem }) {
    setQuickStart({ subSectionCode: ctx.subSectionCode, item: ctx.item });
    setWizardOpen(true);
  }

  function handleWizardOpenChange(open: boolean) {
    setWizardOpen(open);
    if (!open) setQuickStart(undefined);
  }

  function refreshAll() {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  }

  return (
    <main className="flex-1 overflow-y-auto bg-muted/30">
      {/* ── Header + greeting + stats ── */}
      <div className="px-6 py-4 border-b bg-background">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-muted-foreground">Welcome back, {welcomeName}</p>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { setQuickStart(undefined); setWizardOpen(true); }}
          >
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </div>
        <UserStatsCards />
      </div>

      <div className="p-6 space-y-6">

        {/* Shown only when something is actually waiting on the requester. */}
        <AwaitingRatingBanner
          tickets={tickets}
          onRate={(id) => setRating(tickets.find((t) => t.id === id) ?? null)}
        />

        {/* ── Services — one row, one card per service ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">
              Maintenance services available at your campus
            </h2>
            <span className="text-xs text-muted-foreground">
              Pick the closest match to report a fault
            </span>
          </div>
          <QuickActions onServiceSelect={handleServiceSelect} />
        </div>

        {/* ── Recent activity ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Recent activity</h2>
            {totalTickets > RECENT_LIMIT && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate?.('userTickets')}
              >
                View all {totalTickets}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <TicketTable
            tickets={tickets}
            variant="my-tickets"
            loading={ticketsLoading || dashLoading}
            emptyMessage="No requests yet"
            emptyDescription="Anything you report will appear here."
            onRowClick={(t) => onTicketSelect?.(t.id)}
            onRate={(t) => setRating(t)}
          />
        </div>
      </div>

      <TicketCreationWizard
        isOpen={wizardOpen}
        onOpenChange={handleWizardOpenChange}
        onSuccess={refreshAll}
        quickStart={quickStart}
      />

      {rating && (
        <RatingModal
          ticket={rating}
          open
          onClose={() => setRating(null)}
          onSuccess={() => { setRating(null); refreshAll(); }}
        />
      )}
    </main>
  );
};

export default UserDashboard;
