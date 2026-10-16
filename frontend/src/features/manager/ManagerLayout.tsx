import { lazy } from 'react';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import OverviewDashboard from '@/features/shared/OverviewDashboard';

const RoleTicketsPage = lazy(() => import('@/features/shared/RoleTicketsPage'));
const OverviewReportsPage = lazy(() => import('@/features/shared/OverviewReportsPage'));
const TechniciansPage = lazy(() => import('@/features/shared/Technicians/TechniciansPage'));
const FacilitiesPage = lazy(() => import('@/features/shared/Facilities/FacilitiesPage'));
const CampusesPage = lazy(() => import('@/features/admin/CampusesPage'));
const FeedbackTab = lazy(() => import('@/features/shared/FeedbackTab'));
const NotificationsPage = lazy(() => import('@/features/shared/NotificationsPage'));

/** The whole organisation, read-only. The manager sees every campus's ticket
 *  table but opens no ticket, so only Notifications is given `onTicketSelect`:
 *  every notification a manager gets is about a ticket they raised themselves. */
const ManagerLayout = () => (
  <RoleDashboardLayout
    role="manager"
    sections={({ onTicketSelect, onNavigate }) => ({
      dashboard:   <OverviewDashboard role="manager" onNavigate={onNavigate} />,
      tickets:     <RoleTicketsPage role="manager" />,
      reports:     <OverviewReportsPage role="manager" />,
      technicians: <TechniciansPage manage={false} />,
      facilities:  <FacilitiesPage manage={false} />,
      campuses:    <CampusesPage manage={false} />,
      feedback:    <FeedbackTab role="manager" />,
      notifications: <NotificationsPage onTicketSelect={onTicketSelect} />,
    })}
  />
);

export default ManagerLayout;
