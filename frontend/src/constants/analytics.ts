// The reporting vocabulary: the windows a report is read over, and which files
// each role may download.

import type { Bucket, UserRole } from '@/types';

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

/** The report files each role may download. Mirrors `XLSX_ROLES` and
 *  `PDF_ROLES` in `analytics/export.py`. */
export const REPORT_DOWNLOADS: Record<UserRole, ('xlsx' | 'pdf')[]> = {
  admin: ['xlsx', 'pdf'],
  manager: ['xlsx', 'pdf'],
  hod: ['xlsx', 'pdf'],
  hos: ['xlsx', 'pdf'],
  technician: ['xlsx', 'pdf'],
  user: [],
};
