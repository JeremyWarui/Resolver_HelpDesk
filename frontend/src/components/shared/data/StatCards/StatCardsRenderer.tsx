import React from 'react';
import RoleStatsGrid from '../RoleStatsGrid';
import type { StatDefinition } from '@/constants/statCardsConfig';

export interface StatCardsRendererProps<T = Record<string, unknown>> {
  /** Role-specific stat definitions */
  statDefinitions: StatDefinition<T>[];
  /** Raw data to calculate stats from */
  data: T;
  /** Loading state */
  loading: boolean;
  /** Optional click handler */
  onStatClick?: (statId: string) => void;
  /** Optional grid class override */
  gridClassName?: string;
}

/**
 * Generic stat cards renderer — works for ANY role or data shape
 * Receives stat definitions + data, calculates values, renders grid
 *
 * This component is memoized to prevent unnecessary re-renders
 * when parent data hasn't changed
 *
 * @example
 * ```tsx
 * import { StatCardsRenderer } from '@/components/shared/data/StatCards';
 * import { STAT_VIEWS } from '@/constants/statCardsConfig';
 *
 * <StatCardsRenderer
 *   statDefinitions={STAT_VIEWS.admin_system}
 *   data={analyticsData}
 *   loading={isLoading}
 * />
 * ```
 */
function StatCardsRendererComponent<T extends Record<string, unknown>>({
  statDefinitions,
  data,
  loading,
  onStatClick,
  gridClassName,
}: StatCardsRendererProps<T>) {
  // Calculate each stat by calling its calculator function
  const stats = statDefinitions.map((definition) => {
    const result = definition.calculate(data);
    return {
      id: definition.id,
      title: definition.title,
      icon: (
        <definition.icon
          className={`h-6 w-6 ${definition.iconColor ?? 'text-gray-600'}`}
        />
      ),
      iconBgColor: definition.iconBgColor,
      value: result.value,
      badge: result.badge,
      description: result.description,
    };
  });

  return (
    <RoleStatsGrid
      stats={stats}
      loading={loading}
      onCardClick={onStatClick}
      gridClassName={gridClassName}
    />
  );
}

export const StatCardsRenderer = React.memo(
  StatCardsRendererComponent
) as typeof StatCardsRendererComponent;
