// The reporting vocabulary: the windows a report is read over, the dimensions
// each role may cut it by, and how every figure is labelled and rendered.
//
// One file because a report page uses all three together — it picks a window,
// asks whether it may group by a dimension, and then renders figures into the
// columns of that grouping.

import { formatSeconds } from '@/utils/date';
import type { Bucket, Dimension, Figures, UserRole } from '@/types';

// ── The window ────────────────────────────────────────────────────────────────

export type RangeKey = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** The windows a report may be read over, and how finely each one is cut. */
export const RANGES: Record<RangeKey, { label: string; days: number; bucket: Bucket }> = {
  day: { label: 'Today', days: 1, bucket: 'day' },
  week: { label: 'This Week', days: 7, bucket: 'day' },
  month: { label: 'This Month', days: 30, bucket: 'day' },
  quarter: { label: 'This Quarter', days: 90, bucket: 'week' },
  year: { label: 'This Year', days: 365, bucket: 'month' },
};

export const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];

// ── The cut ───────────────────────────────────────────────────────────────────

/**
 * The dimensions each role may be shown, mirroring `analytics/role_config.py`.
 * A dimension a role cannot have is answered with the role's default instead of
 * an error, so asking for one anyway renders a chart titled the wrong thing.
 */
const SUPERVISOR: Dimension[] = ['trade', 'facility', 'technician', 'status'];

const ROLE_DIMENSIONS: Record<UserRole, Dimension[]> = {
  admin: [...SUPERVISOR, 'campus'],
  manager: [...SUPERVISOR, 'campus'],
  hod: SUPERVISOR,
  hos: SUPERVISOR,
  technician: ['status', 'trade'],
  user: ['status'],
};

export const canGroupBy = (role: UserRole, dimension: Dimension) =>
  ROLE_DIMENSIONS[role]?.includes(dimension) ?? false;

/** The report files each role may download. Mirrors `XLSX_ROLES` and
 *  `PDF_ROLES` in `analytics/export.py`. */
export const REPORT_DOWNLOADS: Record<UserRole, ('xlsx' | 'pdf')[]> = {
  admin: ['xlsx'],
  manager: ['xlsx', 'pdf'],
  hod: ['xlsx', 'pdf'],
  hos: ['xlsx', 'pdf'],
  technician: ['xlsx', 'pdf'],
  user: [],
};

/** What each dimension is called in a heading. */
export const DIMENSION_LABELS = {
  trade: 'Trade',
  facility: 'Facility',
  campus: 'Campus',
  technician: 'Technician',
  status: 'Status',
} as const;

// ── The figures ───────────────────────────────────────────────────────────────

export type FigureKey = keyof Figures;

/** How each reported figure is labelled and rendered. Defined once for every table. */
export const FIGURES: Record<FigureKey, { label: string; render: (row: Figures) => string }> = {
  total: { label: 'Total', render: (r) => String(r.total) },
  open: { label: 'Open', render: (r) => String(r.open) },
  settled: { label: 'Settled', render: (r) => String(r.settled) },
  escalated: { label: 'Escalated', render: (r) => String(r.escalated) },
  escalated_hos: { label: 'At HOS', render: (r) => String(r.escalated_hos) },
  escalated_hod: { label: 'At HOD', render: (r) => String(r.escalated_hod) },
  closed: { label: 'Closed', render: (r) => String(r.closed) },
  completion_pct: {
    label: 'Completion',
    render: (r) => (r.completion_pct == null ? '—' : `${r.completion_pct}%`),
  },
  rated_pct: {
    label: 'Rated',
    render: (r) => (r.rated_pct == null ? '—' : `${r.rated_pct}%`),
  },
  missed: { label: 'Missed', render: (r) => String(r.missed) },
  resolution_sla_pct: {
    label: 'Resolution SLA',
    render: (r) => (r.resolution_sla_pct == null ? '—' : `${r.resolution_sla_pct}%`),
  },
  response_sla_pct: {
    label: 'Response SLA',
    render: (r) => (r.response_sla_pct == null ? '—' : `${r.response_sla_pct}%`),
  },
  resolution_seconds_avg: {
    label: 'Avg resolution',
    render: (r) => formatSeconds(r.resolution_seconds_avg),
  },
  response_seconds_avg: {
    label: 'Avg response',
    render: (r) => formatSeconds(r.response_seconds_avg),
  },
  rating_avg: {
    label: 'Rating',
    render: (r) => (r.rating_avg == null ? '—' : `${r.rating_avg} / 5`),
  },
  rating_count: { label: 'Ratings', render: (r) => String(r.rating_count) },
};
