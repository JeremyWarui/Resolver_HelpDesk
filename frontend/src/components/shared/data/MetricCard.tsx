import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { getBadgeStyle } from '@/components/shared/ticket/StatusBadge';
import type { BadgeColor } from '@/constants/colors';

/** One card's worth of figures, for the row below. */
export interface StatConfig {
  /** React key only — the cards are not clickable. */
  id?: string;
  title: string;
  value: number | string;
  description?: string;
  icon: ReactNode;
  iconBgColor: string;
  badge?: { value: string; color: BadgeColor };
}

interface MetricCardProps {
  title: string;
  /** A ReactNode, not just a number: the escalation card's value is a short
   *  list of levels rather than one figure. */
  value: ReactNode;
  icon?: ReactNode;
  iconBgColor?: string;
  badge?: { value: string; color: BadgeColor };
  description?: string;
  className?: string;
  isLoading?: boolean;
  /** `alert` paints the figure in the escalation colour — for a count that is
   *  bad news when it is not zero. */
  tone?: 'default' | 'alert';
}

/**
 * One figure with a label: the card every stat strip in the app is built from.
 *
 * The icon is optional, and its absence is the only difference between the
 * dashboard's stat grid and the plainer strips on the operational pages —
 * those wrote their own `<Card>` three times over, which is how the same
 * number came to sit at three different sizes on three pages.
 */
const MetricCard = ({
  title,
  value,
  icon,
  iconBgColor = 'bg-gray-50',
  badge,
  description,
  className = '',
  isLoading = false,
  tone = 'default',
}: MetricCardProps) => {
  if (isLoading) {
    return (
      <Card className={`${className} animate-pulse`}>
        <CardContent className="p-3 flex items-center">
          {icon && <div className="bg-gray-200 p-2.5 rounded-full mr-3 h-11 w-11 shrink-0" />}
          <div className="w-full min-w-0">
            <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
            <div className="h-7 bg-gray-200 rounded w-16 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-3 flex items-center">
        {icon && (
          <div className={`${iconBgColor} p-2.5 rounded-full mr-3 shrink-0`}>{icon}</div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-gray-500 truncate">{title}</p>
          <div className="flex items-baseline">
            <h3
              className="text-2xl font-bold mr-2 tabular-nums"
              style={tone === 'alert' ? { color: 'var(--status-escalated-text)' } : undefined}
            >
              {value}
            </h3>
            {badge && (
              <span
                className="text-xs px-1.5 py-0.5 rounded whitespace-nowrap"
                style={getBadgeStyle(badge.color)}
              >
                {badge.value}
              </span>
            )}
          </div>
          {description && <p className="text-xs text-gray-500 truncate">{description}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

export default MetricCard;

/** One row of cards on a wide screen, whatever the count. Lives here rather
 *  than in its own module: it is the only way these cards are ever arranged,
 *  and a grid wrapper whose sole job is to render `MetricCard` is not a
 *  separate concern from `MetricCard`. */
const gridClass = (count: number) =>
  count <= 4
    ? 'grid-cols-2 lg:grid-cols-4'
    : count === 5
      ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
      : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';

export const MetricCardRow = ({
  stats,
  loading,
  gridClassName,
}: {
  stats: StatConfig[];
  loading: boolean;
  gridClassName?: string;
}) => (
  <div className={`grid ${gridClassName || gridClass(stats.length)} gap-3 mb-2`}>
    {stats.map((s, i) => (
      <MetricCard
        key={s.id || i}
        title={s.title}
        value={s.value}
        description={s.description}
        icon={s.icon}
        iconBgColor={s.iconBgColor}
        badge={s.badge}
        className="bg-white hover:shadow-md transition-shadow"
        isLoading={loading}
      />
    ))}
  </div>
);
