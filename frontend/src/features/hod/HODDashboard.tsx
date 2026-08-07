import RoleDashboardView from '@/features/shared/RoleDashboardView';

interface Props { onTicketSelect?: (id: number) => void; }
const HODDashboard = ({ onTicketSelect }: Props) => <RoleDashboardView role="hod" onTicketSelect={onTicketSelect} />;

export default HODDashboard;
