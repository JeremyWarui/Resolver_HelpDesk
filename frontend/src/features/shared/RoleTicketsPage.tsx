import TicketsTable from '@/features/shared/TicketsTable';
import TicketStatsCards from '@/components/shared/data/TicketStatsCards';
import { SCOPE_SUBTITLE } from '@/constants/roles';

type TicketsRole = 'admin' | 'manager' | 'hod' | 'hos';

interface Props {
  role: TicketsRole;
  onTicketSelect?: (ticketId: number) => void;
}

/** The tickets page for a supervising role. Both the cards and the table are JWT-scoped. */
export default function RoleTicketsPage({ role, onTicketSelect }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
      <p className="text-sm text-gray-600 mb-2">{SCOPE_SUBTITLE[role]}</p>
      <TicketStatsCards />
      <TicketsTable onTicketSelect={onTicketSelect} />
    </div>
  );
}
