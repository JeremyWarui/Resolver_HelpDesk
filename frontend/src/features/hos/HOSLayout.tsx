import ComingSoonSection from '@/components/shared/ComingSoonSection';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import { ROLE_NAV } from '@/config/roleNav';
import RoleDashboardView from '@/features/shared/RoleDashboardView';
import RoleAnalyticsView from '@/features/shared/RoleAnalyticsView';
import RoleReportsPage from '@/features/shared/RoleReportsPage';
import RoleTicketsPage from '@/features/shared/RoleTicketsPage';
import PendingWorkView from '@/features/shared/PendingWorkView';
import HOSTechnicians from './HOSTechnicians';
import { SLATrackingView } from '@/features/analytics/SLATrackingView';
import FeedbackTab from '@/features/shared/FeedbackTab';

const HOSLayout = () => (
  <RoleDashboardLayout
    nav={ROLE_NAV.hos}
    sections={({ onTicketSelect }) => ({
      dashboard: <RoleDashboardView role="hos" onTicketSelect={onTicketSelect} />,
      tickets: <RoleTicketsPage role="hos" onTicketSelect={onTicketSelect} />,
      pending: <PendingWorkView role="hos" onTicketSelect={onTicketSelect} />,
      technicians: <HOSTechnicians />,
      analytics: <RoleAnalyticsView role="hos" />,
      reports: <RoleReportsPage role="hos" />,
      feedback: <FeedbackTab role="hos" />,
      sla: <SLATrackingView onTicketSelect={onTicketSelect} />,
      settings: <ComingSoonSection section="Settings" />,
    })}
  />
);

export default HOSLayout;
