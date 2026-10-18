/**
 * The FluentUI chart palette, and the badge colours the stat cards take.
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
 * The chart palette — six colours, cycled with `COLORS[i % COLORS.length]`.
 * Ordered blue → green → orange → red → purple → cyan to match the status
 * colours, so a chart and a badge for the same thing agree.
 */
export const CHART_COLORS = [
  FLUENT_UI_COLORS.blue,
  FLUENT_UI_COLORS.green,
  FLUENT_UI_COLORS.orange,
  FLUENT_UI_COLORS.red,
  FLUENT_UI_COLORS.purple,
  FLUENT_UI_COLORS.cyan,
] as const;
