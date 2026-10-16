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
  escalated_hos: number;
  escalated_hod: number;
  closed: number;
  /** Settled of raised, as a percentage. */
  completion_pct: number | null;
  /** Rated of closed, as a percentage. */
  rated_pct: number | null;
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

// The shape of GET /api/v1/analytics/overview/ — the manager's report page.

export interface OverviewParams {
  days?: number;
  bucket?: Bucket;
  /** A campus id: every section narrows to it. */
  campus?: number;
}

export interface OverviewInsight {
  kind: 'campus' | 'trade' | 'staffing' | 'facility' | 'escalated';
  text: string;
}

export interface OverviewFacility {
  key: number;
  label: string;
  campus: string;
  type: string;
  total: number;
  trades: { label: string; code: string | null; total: number }[];
  /** The same fault this many times or more in the period. */
  repeats: { label: string; total: number }[];
  open_now: number;
  resolution_seconds_avg: number | null;
  /** `act`: a repeated fault; `watch`: many faults or slow to fix. */
  flag: 'act' | 'watch';
  suggestion: string;
}

export interface OverviewCampus {
  key: number;
  label: string;
  total: number;
  open_now: number;
  overdue: number;
  at_hod: number;
  resolution_sla_pct: number | null;
  resolution_seconds_avg: number | null;
  rating_avg: number | null;
  technicians: number;
  /** Live assigned jobs per technician; null with nobody on staff. */
  jobs_each: number | null;
}

export interface OverviewEnvelope {
  range: { from: string; to: string };
  campus: { id: number; name: string } | null;
  target_pct: number;
  current: Totals;
  previous: Pick<Totals, 'resolution_sla_pct' | 'resolution_seconds_avg' | 'rating_avg' | 'total'>;
  /** Each headline figure minus the period before's; null when either is missing. */
  change: { resolution_sla_pts: number | null; resolution_hours: number | null; rating: number | null };
  unassigned_now: number;
  at_hod_now: number;
  insights: OverviewInsight[];
  facilities: OverviewFacility[];
  campuses: OverviewCampus[];
  trades: { key: number; label: string; total: number; resolution_sla_pct: number | null; rating_avg: number | null }[];
  trade_by_campus: {
    trades: string[];
    rows: { campus: string; counts: Record<string, number>; total: number }[];
    totals: Record<string, number>;
    total: number;
  };
  trend: TrendPoint[];
  bottlenecks: Bottleneck[];
}

// The shape of GET /api/v1/analytics/dashboard/ — the manager's dashboard.

type WeekFigures = Pick<Totals, 'total' | 'resolution_sla_pct' | 'resolution_seconds_avg' | 'rating_avg' | 'rating_count'>;

export interface DashboardEnvelope {
  /** The last seven Kenyan days, today included. */
  week: { from: string; to: string };
  /** Live work right now. */
  live: { open_now: number; waiting: number; with_technician: number; on_hold: number; overdue: number; at_hod: number };
  this_week: WeekFigures;
  last_week: WeekFigures;
  /** One row per day of the week: raised that day, and resolved that day whenever raised. */
  days: { day: string; raised: number; resolved: number }[];
  target_pct: number;
  /** The Reports page's Campuses table, over the week. */
  campus_table: OverviewCampus[];
  /** Live work by stage, for every campus, calm ones included. */
  campuses: { key: number; label: string; open_now: number; waiting: number; with_technician: number; on_hold: number }[];
}
