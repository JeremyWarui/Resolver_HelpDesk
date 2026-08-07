// ManagerReportsPage — real Reports landing (Quick Access cards + Service Health
// + Excel export), rendered via the shared, role-scoped RoleReportsPage. Wording
// is manager-appropriate ("Department Overview"); all data is scoped server-side.
import RoleReportsPage from '@/features/shared/RoleReportsPage';

export default function ManagerReportsPage() {
  return <RoleReportsPage role="manager" />;
}
