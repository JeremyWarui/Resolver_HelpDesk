import { useState } from 'react';
import { Plus, Ticket as TicketIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterPills } from '@/components/shared/data/FilterPills';
import { TicketTable } from '@/components/shared/ticket/TicketTable';
import { RatingModal } from './RatingModal';
import UserStatsCards from '@/components/shared/data/StatCards/UserStatsCards';
import { useTickets } from '@/hooks/tickets';
import type { FilterPill, Ticket } from '@/types';

const STATUS_PILLS: FilterPill[] = [
  { key: 'all',         label: 'All' },
  { key: 'open',        label: 'Open',        variant: 'open' },
  { key: 'assigned',    label: 'Assigned',    variant: 'assigned' },
  { key: 'in_progress', label: 'In Progress', variant: 'in_progress' },
  { key: 'pending',     label: 'On Hold',     variant: 'pending' },
  { key: 'resolved',    label: 'Resolved',    variant: 'resolved' },
  { key: 'closed',      label: 'Closed',      variant: 'closed' },
];

interface MyTicketsPageProps {
  onNavigate?: (section: 'dashboard' | 'userTickets' | 'submitTicket' | 'settings') => void;
  onTicketSelect?: (ticketId: number) => void;
}

const MyTicketsPage = ({ onNavigate, onTicketSelect }: MyTicketsPageProps) => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [ratingTicket, setRatingTicket] = useState<Ticket | null>(null);

  // Server-side filtered ticket fetch — mine:1 scopes to tickets raised_by == self (R15)
  const { tickets, totalTickets, loading, refetch } = useTickets({
    status: activeFilter !== 'all' ? activeFilter : undefined,
    mine: 1,
    page: pageIndex + 1,
    page_size: pageSize,
  });

  function handleFilterChange(key: string) {
    setActiveFilter(key);
    setPageIndex(0);
  }

  function handleRowClick(ticket: Ticket) {
    setSelectedTicketId(ticket.id);
    onTicketSelect?.(ticket.id);
  }

  function handleRate(ticket: Ticket) {
    setRatingTicket(ticket);
  }

  function handleRatingSuccess() {
    setRatingTicket(null);
    refetch();
  }

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Page header */}
      <div className="px-4 py-3 border-b bg-background flex items-center justify-between shrink-0">
        <div />
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => onNavigate?.('submitTicket')}
        >
          <Plus className="h-4 w-4" />
          New Ticket
        </Button>
      </div>

      {/* Stat cards */}
      <div className="px-4 py-3 border-b bg-background shrink-0">
        <UserStatsCards />
      </div>

      {/* Filter pills */}
      <div className="px-4 py-2 border-b bg-background shrink-0">
        <FilterPills
          pills={STATUS_PILLS}
          active={activeFilter}
          onChange={handleFilterChange}
          className="justify-end"
        />
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {!loading && tickets.length === 0 && activeFilter === 'all' ? (
          /* Empty state — first-time user */
          <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center">
            <div className="rounded-full bg-muted p-5 mb-4">
              <TicketIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1">No tickets yet</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-xs">
              Submit a request and we'll route it to the right team.
            </p>
            <Button onClick={() => onNavigate?.('submitTicket')} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Raise your first ticket
            </Button>
          </div>
        ) : (
          <TicketTable
            tickets={tickets}
            variant="my-tickets"
            title="My Posted Tickets"
            loading={loading}
            onRowClick={handleRowClick}
            onRate={handleRate}
            selectedRowId={selectedTicketId}
            pagination={{
              total: totalTickets,
              pageIndex,
              pageSize,
              onPageChange: (idx) => setPageIndex(idx),
              onPageSizeChange: (size) => { setPageSize(size); setPageIndex(0); },
            }}
            emptyMessage={`No ${activeFilter === 'all' ? '' : activeFilter.replace('_', ' ')} tickets`}
            emptyDescription={
              activeFilter === 'all'
                ? 'Raise a request to get started.'
                : 'Try a different filter.'
            }
          />
        )}
      </div>

      {/* Rating modal — opened via Rate & close action column */}
      {ratingTicket && (
        <RatingModal
          ticket={ratingTicket}
          open={ratingTicket != null}
          onClose={() => setRatingTicket(null)}
          onSuccess={handleRatingSuccess}
        />
      )}
    </div>
  );
};

export default MyTicketsPage;
