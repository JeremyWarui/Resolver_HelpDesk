import { lazy } from 'react';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import MyJobs from './MyJobs';

const TechTickets = lazy(() => import('./TechTickets'));
const TechSectionTickets = lazy(() => import('./TechSectionTickets'));
const PendingWorkView = lazy(() => import('@/features/shared/PendingWorkView'));
const EscalatedWorkView = lazy(() => import('@/features/shared/EscalatedWorkView'));
const TechnicianReportsPage = lazy(() => import('./TechnicianReportsPage'));
const FeedbackTab = lazy(() => import('@/features/shared/FeedbackTab'));
const NotificationsPage = lazy(() => import('@/features/shared/NotificationsPage'));

/** My Jobs is the landing page; its tabs each have an address of their own,
 *  and every one is the same MyJobs element, so moving between them keeps the page.
 *  A technician's reports and feedback cover the jobs assigned to them; Section
 *  Tickets covers their trades at their campus. The server scopes all of it. */
const TechnicianLayout = () => (
  <RoleDashboardLayout
    role="technician"
    sections={({ onTicketSelect, userId }) => ({
      dashboard:       <MyJobs tab="active" onTicketSelect={onTicketSelect} />,
      available:       <MyJobs tab="available" onTicketSelect={onTicketSelect} />,
      pending:         <MyJobs tab="pending" onTicketSelect={onTicketSelect} panel={<PendingWorkView role="technician" onTicketSelect={onTicketSelect} embedded />} />,
      escalated:       <MyJobs tab="escalated" onTicketSelect={onTicketSelect} panel={<EscalatedWorkView role="technician" onTicketSelect={onTicketSelect} embedded />} />,
      assignedTickets: <MyJobs tab="assigned" onTicketSelect={onTicketSelect} panel={<TechTickets currentTechnicianId={userId} onTicketSelect={onTicketSelect} />} />,
      section:         <TechSectionTickets onTicketSelect={onTicketSelect} />,
      reports:         <TechnicianReportsPage />,
      feedback:        <FeedbackTab role="technician" />,
      notifications:   <NotificationsPage onTicketSelect={onTicketSelect} />,
    })}
  />
);

export default TechnicianLayout;
