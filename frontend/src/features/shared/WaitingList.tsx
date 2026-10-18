import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AssignmentModal } from '@/features/shared/AssignmentModal';
import type { WaitingTicket } from '@/types';
import { timeAgo } from '@/utils/date';

interface WaitingListProps {
  waiting: { count: number; rows: WaitingTicket[] } | null;
  onTicketSelect?: (id: number) => void;
  /** Opens the full ticket list, where the rest are. */
  onSeeAll: () => void;
}

/**
 * The tickets waiting longest for a technician, for an HOS or HOD to assign
 * from the dashboard. Assigning sets the priority, as it does on the ticket.
 */
export default function WaitingList({ waiting, onTicketSelect, onSeeAll }: WaitingListProps) {
  const [assigning, setAssigning] = useState<WaitingTicket | null>(null);
  const rows = waiting?.rows ?? null;
  const more = waiting ? waiting.count - waiting.rows.length : 0;

  return (
    <Card aria-label="Waiting to be assigned">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1.5">
          <CardTitle className="text-base">
            Waiting to be assigned{waiting ? ` (${waiting.count})` : ''}
          </CardTitle>
          <CardDescription>Oldest first. Assigning sets the priority.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onSeeAll}>All tickets</Button>
      </CardHeader>
      <CardContent>
        {rows == null ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing is waiting. Every open ticket has a technician.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="p-2 font-medium">Ticket</th>
                  <th className="p-2 font-medium">Fault</th>
                  <th className="p-2 font-medium">Where</th>
                  <th className="p-2 font-medium">Waiting</th>
                  <th className="p-2"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ticket) => (
                  <tr key={ticket.id} className="border-t">
                    <td className="p-2 font-mono text-xs">
                      {onTicketSelect ? (
                        <button type="button" className="text-primary hover:underline" onClick={() => onTicketSelect(ticket.id)}>
                          {ticket.ticket_no}
                        </button>
                      ) : ticket.ticket_no}
                    </td>
                    <td className="p-2">{ticket.service_item?.name ?? ticket.trade?.name}</td>
                    <td className="p-2">{ticket.facility ?? '—'}</td>
                    <td className="p-2 text-muted-foreground">{timeAgo(ticket.waiting_since)}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" className="h-8" onClick={() => setAssigning(ticket)}>Assign</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {more > 0 && (
              <p className="px-2 pt-2 text-xs text-muted-foreground">And {more} more in the ticket list.</p>
            )}
          </div>
        )}
      </CardContent>
      {assigning && (
        <AssignmentModal
          ticket={assigning}
          open
          onClose={() => setAssigning(null)}
          onSuccess={() => setAssigning(null)}
        />
      )}
    </Card>
  );
}
