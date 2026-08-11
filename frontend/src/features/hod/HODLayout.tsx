import ComingSoonSection from '@/components/shared/ComingSoonSection';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import { ROLE_NAV } from '@/config/roleNav';
import HODDashboard from './HODDashboard';
import HODTechnicians from './HODTechnicians';
import HODSections from './HODSections';
import RoleTicketsPage from '@/features/shared/RoleTicketsPage';
import PendingWorkView from '@/features/shared/PendingWorkView';
import EscalatedWorkView from '@/features/shared/EscalatedWorkView';
import RoleAnalyticsView from '@/features/shared/RoleAnalyticsView';
import RoleReportsPage from '@/features/shared/RoleReportsPage';
import { SLATrackingView } from '@/features/analytics/SLATrackingView';
import FeedbackTab from '@/features/shared/FeedbackTab';

const HODLayout = () => (
  <RoleDashboardLayout
    nav={ROLE_NAV.hod}
    sections={({ onTicketSelect }) => ({
      dashboard: <HODDashboard onTicketSelect={onTicketSelect} />,
      tickets: <RoleTicketsPage role="hod" onTicketSelect={onTicketSelect} />,
      pending: <PendingWorkView role="hod" onTicketSelect={onTicketSelect} />,
      escalated: <EscalatedWorkView role="hod" onTicketSelect={onTicketSelect} />,
      technicians: <HODTechnicians />,
      sections: <HODSections />,
      analytics: <RoleAnalyticsView role="hod" />,
      reports: <RoleReportsPage role="hod" />,
      feedback: <FeedbackTab role="hod" />,
      sla: <SLATrackingView onTicketSelect={onTicketSelect} />,
      settings: <ComingSoonSection section="Settings" />,
    })}
  />
);

export default HODLayout;
