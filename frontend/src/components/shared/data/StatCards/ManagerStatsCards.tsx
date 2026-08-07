import { StatCardsRenderer } from './StatCardsRenderer';
import { STAT_VIEWS } from '@/constants/statCardsConfig';
import { useManagerDashboard } from '@/hooks/dashboard';

interface ManagerStatsCardsProps {
  /**
   * Optional override of the role-scoped overview (OverviewResponse) — server
   * already scopes to the manager's department. When omitted, the component
   * self-fetches via useManagerDashboard().
   */
  analyticsData?: unknown;
  loading?: boolean;
}

/**
 * Manager dashboard stats — department tickets by live status (Total, Open,
 * Assigned, Resolved, Pending), mirroring the Admin dashboard card style.
 * Stat logic lives in statCardsConfig.ts (MANAGER_ORGANIZATION_STATS).
 */
const ManagerStatsCards = ({ analyticsData, loading: externalLoading }: ManagerStatsCardsProps) => {
  const { data: dashboardData, loading: contextLoading } = useManagerDashboard();
  const analytics = analyticsData || dashboardData;
  const loading = externalLoading !== undefined ? externalLoading : contextLoading;

  return (
    <StatCardsRenderer
      statDefinitions={STAT_VIEWS.manager_organization}
      data={analytics ?? {}}
      loading={loading}
    />
  );
};

export default ManagerStatsCards;
