import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
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
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <TechTicketsTable currentTechnicianId={userData?.id} onTicketSelect={onTicketSelect} />
    </div>
  );
};

export default TechTicketsPage;
