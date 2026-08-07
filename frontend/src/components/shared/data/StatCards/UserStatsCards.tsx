import { StatCardsRenderer } from './StatCardsRenderer';
import { STAT_VIEWS } from '@/constants/statCardsConfig';
import { useUserDashboard } from '@/hooks/dashboard';

/**
 * User dashboard stats — displays personal ticket metrics
 * Stat definitions in statCardsConfig.ts
 */
const UserStatsCards = () => {
  const { data, loading } = useUserDashboard();

  return (
    <StatCardsRenderer
      statDefinitions={STAT_VIEWS.user_personal}
      data={data ?? {}}
      loading={loading}
    />
  );
};

export default UserStatsCards;
