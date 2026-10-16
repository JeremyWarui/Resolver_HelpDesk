import { lazy } from 'react';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import RoleDashboardView from '@/features/shared/RoleDashboardView';

const RoleTicketsPage = lazy(() => import('@/features/shared/RoleTicketsPage'));
const RoleReportsPage = lazy(() => import('@/features/shared/RoleReportsPage'));
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
    sections={({ onTicketSelect }) => ({
      dashboard:   <RoleDashboardView role="manager" />,
      tickets:     <RoleTicketsPage role="manager" />,
      reports:     <RoleReportsPage role="manager" />,
      technicians: <TechniciansPage manage={false} />,
      facilities:  <FacilitiesPage manage={false} />,
      campuses:    <CampusesPage manage={false} />,
      feedback:    <FeedbackTab role="manager" />,
      notifications: <NotificationsPage onTicketSelect={onTicketSelect} />,
    })}
  />
);

export default ManagerLayout;
