import { StatCardsRenderer } from './StatCardsRenderer';
import { STAT_VIEWS } from '@/constants/statCardsConfig';
import { useAdminDashboard } from '@/hooks/dashboard';

/**
 * Admin dashboard stats — displays system-wide overview
 * All stat logic lives in statCardsConfig.ts
 */
const AdminStatsCards = () => {
  const { data: dashboardData, loading } = useAdminDashboard();

  return (
    <StatCardsRenderer
      statDefinitions={STAT_VIEWS.admin_system}
      data={dashboardData ?? {}}
      loading={loading}
    />
  );
};

export default AdminStatsCards;
