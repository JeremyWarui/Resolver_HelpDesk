// The shape of GET /api/v1/analytics/ — the one reporting endpoint.

export interface AnalyticsParams {
  date_from?: string;
  date_to?: string;
  days?: number;
  /** One or two of: trade, facility, campus, technician, status. */
  group_by?: string;
  bucket?: Bucket;
}

export type Bucket = 'day' | 'week' | 'month';

/** The dimensions a breakdown may be cut on. The role decides which it may ask for. */
export type Dimension = 'trade' | 'facility' | 'campus' | 'technician' | 'status';

/** The figures carried by the totals and by every breakdown row. */
export interface Figures {
  total: number;
  open: number;
  settled: number;
  escalated: number;
  /** Settled after target. Overdue is a different word for live work past target. */
  missed: number;
  resolution_seconds_avg: number | null;
  response_seconds_avg: number | null;
  resolution_sla_pct: number | null;
  response_sla_pct: number | null;
  rating_avg: number | null;
  rating_count: number;
}

/** The figures for the whole scope. Backlog and overdue describe now, not the window. */
export interface Totals extends Figures {
  open_backlog: number;
  overdue: number;
}

/** One breakdown bucket. `key_2`/`label_2` are present when two dimensions were asked for. */
export interface BreakdownRow extends Figures {
  key: number | string;
  label: string;
  key_2?: number | string;
  label_2?: string;
}

/** What is on hold right now, by reason. A snapshot — there is no hold history. */
export interface Bottleneck {
  key: string;
  label: string;
  total: number;
  since: string | null;
}

export interface TrendPoint {
  bucket: string;
  total: number;
  settled: number;
}

export interface AnalyticsEnvelope {
  scope: { role: string | null; group_by: Dimension[] };
  range: { from: string; to: string; bucket: Bucket };
  totals: Totals;
  breakdown: BreakdownRow[];
  bottlenecks: Bottleneck[];
  trend: TrendPoint[];
}
