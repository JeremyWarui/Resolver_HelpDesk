/**
 * Stat Cards Directory
 *
 * Centralized, reusable stat card components for all roles/dashboards
 * Organized by view rather than role to enable shared stats
 *
 * @see STAT_CARDS_REFERENCE.md for detailed documentation
 * @see @/constants/statCardsConfig.ts for all stat definitions
 */

export { StatCardsRenderer } from './StatCardsRenderer';
export { default as AdminStatsCards } from './AdminStatsCards';
export { default as UserStatsCards } from './UserStatsCards';
export { default as TechnicianStatsCards } from './TechnicianStatsCards';
export { default as ManagerStatsCards } from './ManagerStatsCards';
export { default as HODStatsCards } from './HODStatsCards';
export { default as SectionHeadStatsCards } from './SectionHeadStatsCards';

// Type exports
export type { StatCardsRendererProps } from './StatCardsRenderer';
