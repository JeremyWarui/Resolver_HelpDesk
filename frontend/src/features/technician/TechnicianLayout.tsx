import { lazy, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import TechSectionTickets from './TechSectionTickets';

const TechTickets = lazy(() => import('./TechTickets'));
const PendingWorkView = lazy(() => import('@/features/shared/PendingWorkView'));
const EscalatedWorkView = lazy(() => import('@/features/shared/EscalatedWorkView'));
const FeedbackTab = lazy(() => import('@/features/shared/FeedbackTab'));
const RoleReportsPage = lazy(() => import('@/features/shared/RoleReportsPage'));

const TechnicianLayout = () => {
  const navigate = useNavigate();

  // A phone gets the PWA shell instead: this layout is a sidebar and a wide
  // table, neither of which survives a 375px screen.
  useEffect(() => {
    if (window.innerWidth < 640) {
      navigate('/tech/mobile', { replace: true });
    }
  }, [navigate]);

  return (
    <RoleDashboardLayout
      role="technician"
      sections={({ onTicketSelect, userId }) => ({
        dashboard:       <TechSectionTickets onTicketSelect={onTicketSelect} />,
        assignedTickets: <TechTickets currentTechnicianId={userId} onTicketSelect={onTicketSelect} />,
        pending:         <PendingWorkView role="technician" onTicketSelect={onTicketSelect} />,
        escalated:       <EscalatedWorkView role="technician" onTicketSelect={onTicketSelect} />,
        feedback:        <FeedbackTab role="technician" />,
        reports:         <RoleReportsPage role="technician" />,
      })}
    />
  );
};

export default TechnicianLayout;
