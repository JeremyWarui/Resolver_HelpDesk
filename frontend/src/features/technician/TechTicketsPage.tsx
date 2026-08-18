import TechTicketsTable from './TechTickets';
import { useAuthStore } from '@/stores/authStore';

interface TechTicketsPageProps {
  onTicketSelect?: (ticketId: number) => void;
}

const TechTicketsPage = ({ onTicketSelect }: TechTicketsPageProps) => {
  const userData = useAuthStore((s) => s.user);

  return (
    <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-4">
      <div className="flex justify-between mb-2">
        <div>
          <p className="text-sm text-gray-600">Tickets assigned to you</p>
        </div>
      </div>

      <TechTicketsTable currentTechnicianId={userData?.id} onTicketSelect={onTicketSelect} />
    </div>
  );
};

export default TechTicketsPage;
