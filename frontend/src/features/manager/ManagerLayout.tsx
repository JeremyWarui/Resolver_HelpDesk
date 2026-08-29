import { lazy } from 'react';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import RoleDashboardView from '@/features/shared/RoleDashboardView';

const RoleTicketsPage = lazy(() => import('@/features/shared/RoleTicketsPage'));
const FacilitiesPage = lazy(() => import('@/features/shared/Facilities/FacilitiesPage'));
const RoleReportsPage = lazy(() => import('@/features/shared/RoleReportsPage'));
const FeedbackTab = lazy(() => import('@/features/shared/FeedbackTab'));

/** Organisation-wide reporting and analytics (REVIEW.md §4). Oversight is
 *  read-only, so there is no operational queue here: what is on hold is on the
 *  reports page, counted by the server rather than by one page of rows. */
const ManagerLayout = () => (
  <RoleDashboardLayout
    role="manager"
    sections={({ onTicketSelect }) => ({
      dashboard:  <RoleDashboardView role="manager" onTicketSelect={onTicketSelect} />,
      tickets:    <RoleTicketsPage role="manager" onTicketSelect={onTicketSelect} />,
      facilities: <FacilitiesPage manage={false} />,
      reports:    <RoleReportsPage role="manager" />,
      feedback:   <FeedbackTab role="manager" />,
    })}
  />
);

export default ManagerLayout;
