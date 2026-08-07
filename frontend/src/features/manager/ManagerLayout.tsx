import { Suspense, lazy, type ReactNode } from 'react';
import ComingSoonSection from '@/components/shared/ComingSoonSection';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import { ROLE_NAV } from '@/config/roleNav';
import ManagerDashboard from './ManagerDashboard';

const ManagerTickets = lazy(() => import('./ManagerTickets'));
const ManagerAnalytics = lazy(() => import('./ManagerAnalytics'));
const ManagerReportsPage = lazy(() => import('./ManagerReportsPage'));
const FeedbackTab = lazy(() => import('@/features/shared/FeedbackTab'));

const PageLoading = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
    <span className="ml-2 text-muted-foreground">Loading page...</span>
  </div>
);

const ManagerLayout = () => (
  <RoleDashboardLayout
    nav={ROLE_NAV.manager}
    renderWrapper={(node: ReactNode) => <Suspense fallback={<PageLoading />}>{node}</Suspense>}
    sections={({ onTicketSelect, userId }) => ({
      dashboard: <ManagerDashboard onTicketSelect={onTicketSelect} />,
      tickets: <ManagerTickets userId={userId} onTicketSelect={onTicketSelect} />,
      analytics: <ManagerAnalytics />,
      reports: <ManagerReportsPage />,
      feedback: <FeedbackTab role="manager" />,
      settings: <ComingSoonSection section="Settings" />,
    })}
  />
);

export default ManagerLayout;
