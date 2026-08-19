import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ComingSoonSection from '@/components/shared/ComingSoonSection';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import { ROLE_NAV } from '@/config/roleNav';
import TechSectionTickets from './TechSectionTickets';
import TechTicketsPage from './TechTicketsPage';
import EscalatedWorkView from '@/features/shared/EscalatedWorkView';
import PendingWorkView from '@/features/shared/PendingWorkView';
import RoleReportsPage from '@/features/shared/RoleReportsPage';
import FeedbackTab from '@/features/shared/FeedbackTab';

const TechnicianLayout = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (window.innerWidth < 640) {
      navigate('/tech/mobile', { replace: true });
    }
  }, [navigate]);

  return (
    <RoleDashboardLayout
      nav={ROLE_NAV.technician}
      sections={({ onTicketSelect, userId }) => ({
        dashboard:      <TechSectionTickets currentTechnicianId={userId} onTicketSelect={onTicketSelect} />,
        assignedTickets: <TechTicketsPage onTicketSelect={onTicketSelect} />,
        pending:        <PendingWorkView role="technician" onTicketSelect={onTicketSelect} />,
        escalated:      <EscalatedWorkView role="technician" onTicketSelect={onTicketSelect} />,
        feedback:       <FeedbackTab role="technician" />,
        report:         <RoleReportsPage role="technician" />,
        settings:       <ComingSoonSection section="Settings" />,
      })}
    />
  );
};

export default TechnicianLayout;
