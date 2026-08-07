// Admin Reports landing — thin wrapper over the shared, role-scoped RoleReportsPage.
// All structure, tabs, and copy for admin live in RoleReportsPage; admin wording
// is preserved exactly (e.g. "System Overview"). Data is JWT-scoped server-side.
import RoleReportsPage from '@/features/shared/RoleReportsPage';

export default function ReportsPageEnhanced() {
  return <RoleReportsPage role="admin" />;
}
