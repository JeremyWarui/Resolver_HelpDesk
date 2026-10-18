import { useState } from 'react';
import { ArrowRight, CheckCircle2, MapPin, PauseCircle, Plus, Star, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/ticket/StatusBadge';
import type { TicketQuickStart } from '@/components/shared/ticket/TicketCreationWizard';
import QuickActions from './QuickActions';
import { RatingModal } from './RatingModal';
import { useAuthStore } from '@/stores/authStore';
import { useTickets } from '@/hooks/tickets/useTickets';
import { timeAgo } from '@/utils/date';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

interface UserDashboardProps {
  /** The shell owns the wizard, so this page opens it by navigating, with the
   *  chosen service along. */
  onNavigate?: (
    section: 'dashboard' | 'userTickets' | 'submitTicket',
    quickStart?: TicketQuickStart,
  ) => void;
  onTicketSelect?: (id: number) => void;
}

/** Every request still in flight, for anyone but a very heavy reporter. */
const ACTIVE_LIMIT = 100;
/** Resolved requests waiting on a rating; rating one closes it. */
const AWAITING_LIMIT = 50;
/** Cards shown at first, and how many each Show more adds. */
const ACTIVE_STEP = 6;

const titleOf = (t: Ticket) => t.service_item?.name ?? t.trade?.name ?? 'Request';

/**
 * The requester's landing page: report something, see what is in flight, and
 * rate what was fixed. The full list is My Tickets.
 *
 * Wide screens put the rating column beside the other two; narrow ones stack
 * it between them, so a fix waiting for a rating is seen before the list.
 * A resolved ticket is always unrated, because rating it closes it.
 */
const UserDashboard = ({ onNavigate, onTicketSelect }: UserDashboardProps) => {
  const queryClient = useQueryClient();
  const userData = useAuthStore((s) => s.user);
  const inFlight = useTickets({ mine: 1, status: 'active', page_size: ACTIVE_LIMIT });
  const resolved = useTickets({ mine: 1, status: 'resolved', page_size: AWAITING_LIMIT });
  const [rating, setRating] = useState<{ ticket: Ticket; stars: number } | null>(null);
  const [shown, setShown] = useState(ACTIVE_STEP);

  const loading = inFlight.loading || resolved.loading;
  // Rating a resolved request closes it, so every resolved one is unrated.
  const awaiting = resolved.tickets;
  const awaitingTotal = resolved.totalTickets;
  const active = inFlight.tickets;
  const activeTotal = inFlight.totalTickets;
  const firstName = userData?.first_name || userData?.username || 'there';

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Hello, {firstName}</h2>
          <p className="text-sm text-gray-500">What needs fixing today?</p>
        </div>
        <Button variant="brand" className="gap-1.5" onClick={() => onNavigate?.('submitTicket')}>
          <Plus className="h-4 w-4" />
          New Ticket
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        <section aria-labelledby="services-heading" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 id="services-heading" className="text-sm font-semibold text-gray-700">Report a fault</h3>
            <span className="text-xs text-gray-400">Pick the closest match</span>
          </div>
          <QuickActions onServiceSelect={(quick) => onNavigate?.('submitTicket', quick)} />
        </section>

        <section
          aria-labelledby="rate-heading"
          className="xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-4"
        >
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <Star className="h-4 w-4 text-amber-500" aria-hidden />
              <h3 id="rate-heading" className="text-sm font-semibold text-gray-700">Rate your fixes</h3>
              {awaitingTotal > 0 && (
                <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 tabular-nums">
                  {awaitingTotal}
                </span>
              )}
            </div>
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : awaiting.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                <CheckCircle2 className="h-7 w-7 text-green-500" aria-hidden />
                <p className="text-sm font-medium text-gray-700">Nothing to rate</p>
                <p className="text-xs text-gray-400">When a fix is done, it waits here for your rating.</p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-gray-100 max-h-[34rem] overflow-y-auto">
                  {awaiting.map((t) => (
                    <RateRow
                      key={t.id}
                      ticket={t}
                      onOpen={() => onTicketSelect?.(t.id)}
                      onRate={(stars) => setRating({ ticket: t, stars })}
                    />
                  ))}
                </ul>
                <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
                  Rating a fix closes its ticket.
                </p>
              </>
            )}
          </Card>
        </section>

        <section aria-labelledby="active-heading" className="min-w-0 xl:col-start-1 xl:row-start-2">
          <div className="flex items-center justify-between mb-3">
            <h3 id="active-heading" className="text-sm font-semibold text-gray-700">
              Your active requests
              {activeTotal > 0 && <span className="ml-1.5 font-normal text-gray-400">{activeTotal}</span>}
            </h3>
            {/* My Tickets is a table, kept for a computer; a phone pages through the cards. */}
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex gap-1 h-7 text-xs text-gray-500 hover:text-gray-900"
              onClick={() => onNavigate?.('userTickets')}
            >
              All my tickets
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : active.length === 0 ? (
            <Card className="px-5 py-8 text-center">
              <p className="text-sm font-medium text-gray-600">No active requests</p>
              <p className="text-xs text-gray-400 mt-1">Anything you report will be followed here until it is fixed.</p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {active.slice(0, shown).map((t) => (
                <ActiveRequestCard key={t.id} ticket={t} onOpen={() => onTicketSelect?.(t.id)} />
              ))}
            </div>
          )}
          {active.length > shown && (
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => setShown((n) => n + ACTIVE_STEP)}
            >
              Show {Math.min(ACTIVE_STEP, active.length - shown)} more · {active.length - shown} left
            </Button>
          )}
          {shown >= active.length && activeTotal > active.length && (
            <p className="mt-2 text-xs text-gray-500">
              These are the {active.length} most recently updated; all {activeTotal} are in My
              Tickets on a computer.
            </p>
          )}
        </section>
      </div>

      {rating && (
        <RatingModal
          ticket={rating.ticket}
          initialRating={rating.stars}
          open
          onClose={() => setRating(null)}
          onSuccess={() => { setRating(null); refreshAll(); }}
        />
      )}
    </div>
  );
};

/** A finished job waiting on the requester. Picking a star opens the rating
 *  dialog with it chosen, where a comment can be added before it is sent. */
function RateRow({ ticket, onOpen, onRate }: {
  ticket: Ticket;
  onOpen: () => void;
  onRate: (stars: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <li className="px-4 py-3" aria-label={`${titleOf(ticket)}, ${ticket.ticket_no}`}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <p className="text-sm font-medium text-gray-900 truncate">{titleOf(ticket)}</p>
        <p className="text-xs text-gray-500 truncate">
          {ticket.assigned_to?.full_name ? `Fixed by ${ticket.assigned_to.full_name}` : ticket.ticket_no}
          {ticket.resolved_at && ` · ${timeAgo(ticket.resolved_at)}`}
        </p>
      </button>
      <div className="mt-2 flex items-center gap-0.5" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
            onMouseEnter={() => setHovered(n)}
            onFocus={() => setHovered(n)}
            onBlur={() => setHovered(0)}
            onClick={() => onRate(n)}
            className="p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Star
              className={cn(
                'h-5 w-5 transition-colors',
                n <= hovered ? 'fill-amber-400 text-amber-400' : 'text-gray-300',
              )}
            />
          </button>
        ))}
      </div>
    </li>
  );
}

/** One request still in flight: what, where, who has it, and how it stands. */
function ActiveRequestCard({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  const onHold = ticket.status === 'pending';
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${titleOf(ticket)}, ${ticket.ticket_no}`}
      className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-gray-400">{ticket.ticket_no}</span>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-900 truncate">{titleOf(ticket)}</p>
      {ticket.facility && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 truncate">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          {ticket.facility}
        </p>
      )}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-xs">
        {onHold ? (
          <span className="flex items-center gap-1 text-purple-700 truncate">
            <PauseCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {ticket.pending_reason_display ?? 'On hold'}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-gray-600 truncate">
            <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {ticket.assigned_to?.full_name ?? 'Waiting for a technician'}
          </span>
        )}
        <span className="shrink-0 text-gray-400">{timeAgo(ticket.updated_at)}</span>
      </div>
    </button>
  );
}

export default UserDashboard;
