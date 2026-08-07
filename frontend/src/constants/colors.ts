/**
 * Unified FluentUI color palette for charts, badges, and UI elements.
 * This is the canonical source for all color definitions in the application.
 * Keeps colors consistent across status badges, priority badges, and charts.
 */

export const FLUENT_UI_COLORS = {
  blue: '#0078d4',    // Primary, open/assigned status
  green: '#107c10',   // Success, resolved status
  orange: '#ffaa44',  // Warning, in_progress status
  red: '#d13438',     // Danger, escalated status
  purple: '#5c2d91',  // Secondary, pending status
} as const;

/**
 * Chart color palette - 5 colors cycling through datasets.
 * Ordered: blue → green → orange → red → purple
 * Maps directly to status family colors for visual consistency.
 */
export const CHART_COLORS = [
  FLUENT_UI_COLORS.blue,
  FLUENT_UI_COLORS.green,
  FLUENT_UI_COLORS.orange,
  FLUENT_UI_COLORS.red,
  FLUENT_UI_COLORS.purple,
] as const;

/**
 * Semantic color assignments:
 * - Primary/Default: blue (tickets, primary actions)
 * - Success/Complete: green (resolved, closed)
 * - Warning/In-Progress: orange (in progress, medium priority)
 * - Danger/Critical: red (escalated, critical priority)
 * - Secondary/Pending: purple (pending status)
 */

export type FluentUIColor = typeof FLUENT_UI_COLORS[keyof typeof FLUENT_UI_COLORS];
export type BadgeColor = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray' | 'amber';

/**
 * Convert badge color names to CSS variable tokens.
 * Used by StatusBadge, PriorityBadge, and MetricCard badge rendering.
 */
export const BADGE_COLOR_CSS_VARS: Record<BadgeColor, { bg: string; text: string }> = {
  blue: {
    bg: '--status-open-bg',
    text: '--status-open-text',
  },
  green: {
    bg: '--status-resolved-bg',
    text: '--status-resolved-text',
  },
  orange: {
    bg: '--status-progress-bg',
    text: '--status-progress-text',
  },
  red: {
    bg: '--status-escalated-bg',
    text: '--status-escalated-text',
  },
  purple: {
    bg: '--status-pending-bg',
    text: '--status-pending-text',
  },
  gray: {
    bg: '--status-closed-bg',
    text: '--status-closed-text',
  },
  amber: {
    bg: '--status-approval-bg',
    text: '--status-approval-text',
  },
};
