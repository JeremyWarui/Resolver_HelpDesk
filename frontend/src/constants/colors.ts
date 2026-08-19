/**
 * Unified FluentUI color palette for charts, badges, and UI elements.
 * This is the canonical source for all color definitions in the application.
 * Keeps colors consistent across status badges, priority badges, and charts.
 */

const FLUENT_UI_COLORS = {
  blue: '#0078d4',    // Primary, open/assigned status
  green: '#107c10',   // Success, resolved status
  orange: '#ffaa44',  // Warning, in_progress status
  red: '#d13438',     // Danger, escalated status
  purple: '#5c2d91',  // Secondary, pending status
  cyan: '#00b4d8',    // Sixth series — charts cycle, so this delays a repeat
} as const;

/**
 * Chart color palette — six colors, cycled with `COLORS[i % COLORS.length]`.
 * Ordered blue → green → orange → red → purple → cyan, matching the status
 * family colors so a chart and a badge for the same thing agree.
 *
 * Five files each kept a private copy of this array. They were byte-identical,
 * which is the good case: the bad case is the day one of them gains a color and
 * the same section is drawn in two different shades on two different pages.
 */
export const CHART_COLORS = [
  FLUENT_UI_COLORS.blue,
  FLUENT_UI_COLORS.green,
  FLUENT_UI_COLORS.orange,
  FLUENT_UI_COLORS.red,
  FLUENT_UI_COLORS.purple,
  FLUENT_UI_COLORS.cyan,
] as const;

/**
 * Semantic color assignments:
 * - Primary/Default: blue (tickets, primary actions)
 * - Success/Complete: green (resolved, closed)
 * - Warning/In-Progress: orange (in progress, medium priority)
 * - Danger/Critical: red (escalated, critical priority)
 * - Secondary/Pending: purple (pending status)
 */

export type BadgeColor = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray' | 'amber';
