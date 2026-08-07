import { StatCardsRenderer } from './StatCardsRenderer';
import { STAT_VIEWS } from '@/constants/statCardsConfig';

export interface TechnicianStatsCardsProps {
  counts: {
    all?: number;
    assigned?: number;
    in_progress?: number;
    pending?: number;
    resolved?: number;
  };
  loading?: boolean;
}

/**
 * Technician personal stats — read-only overview of the technician's own queue
 * by status (New Work, Active Jobs, On Hold, Finished). Stat logic lives in
 * statCardsConfig.ts (TECHNICIAN_PERSONAL_STATS). Table filtering is handled
 * separately by the FilterPills row, not by these cards.
 */
export default function TechnicianStatsCards({
  counts,
  loading = false,
}: TechnicianStatsCardsProps) {
  return (
    <StatCardsRenderer
      statDefinitions={STAT_VIEWS.technician_personal}
      data={{ counts }}
      loading={loading}
      gridClassName="grid-cols-2 md:grid-cols-4 gap-3 mb-4"
    />
  );
}
