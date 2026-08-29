import { lazy } from 'react';
import { RoleDashboardLayout } from '@/components/layout/RoleDashboardLayout';
import RoleDashboardView from '@/features/shared/RoleDashboardView';

const RoleTicketsPage = lazy(() => import('@/features/shared/RoleTicketsPage'));
const PendingWorkView = lazy(() => import('@/features/shared/PendingWorkView'));
const EscalatedWorkView = lazy(() => import('@/features/shared/EscalatedWorkView'));
const TechniciansPage = lazy(() => import('@/features/shared/Technicians/TechniciansPage'));
const FacilitiesPage = lazy(() => import('@/features/shared/Facilities/FacilitiesPage'));
const RoleReportsPage = lazy(() => import('@/features/shared/RoleReportsPage'));
const FeedbackTab = lazy(() => import('@/features/shared/FeedbackTab'));
const SLATrackingView = lazy(() =>
  import('@/features/shared/SLATrackingView').then((m) => ({ default: m.SLATrackingView })),
);

/**
 * The layout both supervising roles render inside.
 *
 * An HOS runs one campus's technicians and an HOD oversees the HOS, but they
 * oversee the same work through the same nine sections — `ROLE_NAV.hos` and
 * `ROLE_NAV.hod` list the same ids. The difference between them is scope, and
 * scope is decided server-side from the JWT's role claim, so every page here
 * returns each one their own rows without being told which role asked.
 *
 * Neither manages the roster or the estate: `manage={false}` leaves the create
 * and edit controls off both registers, which the admin owns.
 */
export default function SupervisorLayout({ role }: { role: 'hos' | 'hod' }) {
  return (
    <RoleDashboardLayout
      role={role}
      sections={({ onTicketSelect }) => ({
        dashboard:   <RoleDashboardView role={role} onTicketSelect={onTicketSelect} />,
        tickets:     <RoleTicketsPage role={role} onTicketSelect={onTicketSelect} />,
        pending:     <PendingWorkView role={role} onTicketSelect={onTicketSelect} />,
        escalated:   <EscalatedWorkView role={role} onTicketSelect={onTicketSelect} />,
        technicians: <TechniciansPage manage={false} />,
        facilities:  <FacilitiesPage manage={false} />,
        reports:     <RoleReportsPage role={role} />,
        feedback:    <FeedbackTab role={role} />,
        sla:         <SLATrackingView onTicketSelect={onTicketSelect} />,
      })}
    />
  );
}
