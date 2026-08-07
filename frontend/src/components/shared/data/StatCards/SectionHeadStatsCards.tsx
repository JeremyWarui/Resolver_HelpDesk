import { StatCardsRenderer } from './StatCardsRenderer';
import { STAT_VIEWS } from '@/constants/statCardsConfig';
import { useSectionHeadDashboard } from '@/hooks/dashboard';

interface SectionHeadStatsCardsProps {
  /**
   * Optional override of the role-scoped overview (OverviewResponse) — server
   * already scopes to the HOS's section(s). When omitted, the component
   * self-fetches via useSectionHeadDashboard().
   */
  data?: unknown;
  /** Optional loading override. When omitted, the self-fetch loading state is used. */
  loading?: boolean;
}

/**
 * Section Head (HOS) dashboard stats — section-scoped ticket overview (Total/Open/
 * Assigned/Resolved/Pending), identical card style to Admin/Manager. Self-fetches
 * the role-scoped `/analytics/overview/` payload (live_status_distribution) via
 * useSectionHeadDashboard(), but accepts optional `data`/`loading` overrides for
 * call sites that already have the payload. Logic lives in statCardsConfig.ts
 * (SECTION_HEAD_PERSONAL_STATS via the shared statusOverviewStats factory).
 */
const SectionHeadStatsCards = ({ data, loading }: SectionHeadStatsCardsProps) => {
  const { data: fetched, loading: contextLoading } = useSectionHeadDashboard();
  const resolved = data ?? fetched;
  const isLoading = loading !== undefined ? loading : contextLoading;

  return (
    <StatCardsRenderer
      statDefinitions={STAT_VIEWS.section_head_personal}
      data={(resolved as Record<string, unknown>) ?? {}}
      loading={isLoading}
    />
  );
};

export default SectionHeadStatsCards;
