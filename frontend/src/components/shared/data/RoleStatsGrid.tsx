import MetricCard from './MetricCard';
import type { ReactNode } from 'react';

type BadgeColor = 'amber' | 'blue' | 'green' | 'red' | 'purple' | 'gray';

export interface StatConfig {
  id?: string;
  title: string;
  value: number | string;
  description?: string;
  icon: ReactNode;
  iconBgColor: string;
  badge?: { value: string; color: BadgeColor };
}

interface RoleStatsGridProps {
  stats: StatConfig[];
  loading: boolean;
  onCardClick?: (id: string) => void;
  gridClassName?: string;
}

const gridClass = (count: number) =>
  count <= 4
    ? 'grid-cols-2 lg:grid-cols-4'
    : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-5';

const RoleStatsGrid = ({ stats, loading, onCardClick, gridClassName }: RoleStatsGridProps) => (
  <div className={`grid ${gridClassName || gridClass(stats.length)} gap-3 mb-2`}>
    {stats.map((s, i) => (
      <div
        key={s.id || i}
        onClick={() => s.id && onCardClick?.(s.id)}
        className={onCardClick && s.id ? 'cursor-pointer' : ''}
      >
        <MetricCard
          title={s.title}
          value={s.value}
          description={s.description}
          icon={s.icon}
          iconBgColor={s.iconBgColor}
          badge={s.badge}
          className="bg-white hover:shadow-md transition-shadow"
          isLoading={loading}
        />
      </div>
    ))}
  </div>
);

export default RoleStatsGrid;
