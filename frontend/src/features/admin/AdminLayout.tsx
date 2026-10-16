import { lazy } from 'react';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import RoleDashboardView from '@/features/shared/RoleDashboardView';

const RoleTicketsPage = lazy(() => import('@/features/shared/RoleTicketsPage'));
const RoleReportsPage = lazy(() => import('@/features/shared/RoleReportsPage'));
const TechniciansPage = lazy(() => import('@/features/shared/Technicians/TechniciansPage'));
const FacilitiesPage = lazy(() => import('@/features/shared/Facilities/FacilitiesPage'));
const CampusesPage = lazy(() => import('./CampusesPage'));
const CataloguePage = lazy(() => import('./Catalogue/CataloguePage'));
const UsersPage = lazy(() => import('./UsersPage'));
const SLARulesPage = lazy(() => import('./SLARulesPage'));
const NotificationsPage = lazy(() => import('@/features/shared/NotificationsPage'));
const SystemFeedbackPage = lazy(() => import('./SystemFeedbackPage'));

/** Configuration and oversight across every campus. The only role that manages
 *  the roster and the estate, so the two registers keep their edit controls. */
const AdminLayout = () => (
  <RoleDashboardLayout
    role="admin"
    sections={({ onTicketSelect }) => ({
      dashboard:   <RoleDashboardView role="admin" onTicketSelect={onTicketSelect} />,
      tickets:     <RoleTicketsPage role="admin" onTicketSelect={onTicketSelect} />,
      reports:     <RoleReportsPage role="admin" />,
      technicians: <TechniciansPage />,
      facilities:  <FacilitiesPage />,
      campuses:    <CampusesPage />,
      inventory:   <CataloguePage />,
      users:       <UsersPage />,
      'sla-rules': <SLARulesPage />,
      'system-feedback': <SystemFeedbackPage />,
      notifications: <NotificationsPage onTicketSelect={onTicketSelect} />,
    })}
  />
);

export default AdminLayout;
