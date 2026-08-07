import { StatCardsRenderer } from './StatCardsRenderer';
import { STAT_VIEWS } from '@/constants/statCardsConfig';
import { useHODDashboard } from '@/hooks/dashboard';

interface HODStatsCardsProps {
  /**
   * Optional override of the role-scoped overview (OverviewResponse) — server
   * already scopes to the HOD's department. When omitted, the component
   * self-fetches via useHODDashboard().
   */
  data?: unknown;
  /** Optional loading override. When omitted, the self-fetch loading state is used. */
  loading?: boolean;
}

/**
 * HOD dashboard stats — department-scoped ticket overview (Total/Open/Assigned/
 * Resolved/Pending), identical card style to Admin/Manager. Self-fetches the
 * role-scoped `/analytics/overview/` payload (live_status_distribution) via
 * useHODDashboard(), but accepts optional `data`/`loading` overrides for call
 * sites that already have the payload. Logic lives in statCardsConfig.ts
 * (HOD_DEPARTMENT_STATS via the shared statusOverviewStats factory).
 */
const HODStatsCards = ({ data, loading }: HODStatsCardsProps) => {
  const { data: fetched, loading: contextLoading } = useHODDashboard();
  const resolved = data ?? fetched;
  const isLoading = loading !== undefined ? loading : contextLoading;

  return (
    <StatCardsRenderer
      statDefinitions={STAT_VIEWS.hod_department}
      data={(resolved as Record<string, unknown>) ?? {}}
      loading={isLoading}
    />
  );
};

export default HODStatsCards;
