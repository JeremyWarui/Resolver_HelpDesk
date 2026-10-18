import type { Ticket } from './ticket.types';

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

/** A download's period, and for a report over every campus, one campus to narrow it to. */
export interface ReportParams extends AnalyticsParams {
  campus?: number;
}

/** The dimensions a breakdown may be cut on. The role decides which it may ask for. */
export type Dimension = 'trade' | 'facility' | 'campus' | 'technician' | 'status';

/** The figures carried by the totals and by every breakdown row. */
interface Figures {
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
  /** The trades the held tickets are in, most first. */
  trades: { label: string; code: string | null; total: number }[];
}

export interface TrendPoint {
  bucket: string;
  total: number;
  settled: number;
}

/** The figures a report sets beside the period before. */
export type PeriodBefore = Pick<Totals, 'total' | 'settled' | 'resolution_sla_pct' | 'resolution_seconds_avg'>;

export interface AnalyticsEnvelope {
  scope: { role: string | null; group_by: Dimension[] };
  range: { from: string; to: string; bucket: Bucket };
  totals: Totals;
  breakdown: BreakdownRow[];
  bottlenecks: Bottleneck[];
  trend: TrendPoint[];
}

// The shape of GET /api/v1/analytics/overview/ — the Reports page of the manager, HOD and HOS.

export interface OverviewParams {
  days?: number;
  bucket?: Bucket;
  /** A campus id: every section narrows to it. */
  campus?: number;
}

export interface OverviewInsight {
  kind: 'campus' | 'trade' | 'technician' | 'staffing' | 'facility' | 'escalated';
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

/** A technician's jobs raised in the period and assigned to them, and what they hold now. */
export interface TechnicianRow {
  key: number;
  label: string;
  total: number;
  open_now: number;
  overdue: number;
  resolution_sla_pct: number | null;
  resolution_seconds_avg: number | null;
  rating_avg: number | null;
}

export interface OverviewEnvelope {
  range: { from: string; to: string };
  campus: { id: number; name: string } | null;
  target_pct: number;
  current: Totals;
  previous: PeriodBefore;
  insights: OverviewInsight[];
  facilities: OverviewFacility[];
  trades: { key: number; label: string; total: number; resolution_sla_pct: number | null; rating_avg: number | null }[];
  /** The manager's: every campus. */
  campuses?: OverviewCampus[];
  trade_by_campus?: {
    trades: string[];
    rows: { campus: string; counts: Record<string, number>; total: number }[];
    totals: Record<string, number>;
    total: number;
  };
  /** An HOS's or HOD's: everyone working their campus. */
  technicians?: TechnicianRow[];
  trend: TrendPoint[];
  bottlenecks: Bottleneck[];
}

// The shape of GET /api/v1/analytics/dashboard/ — the manager's, HOD's and HOS's dashboard.

type WeekFigures = Pick<Totals, 'total' | 'settled' | 'resolution_sla_pct' | 'resolution_seconds_avg' | 'rating_avg' | 'rating_count'>;

export interface DashboardEnvelope {
  /** The last seven Kenyan days, today included. */
  week: { from: string; to: string };
  /** Live work right now. */
  live: { open_now: number; waiting: number; with_technician: number; on_hold: number; overdue: number; at_hod: number };
  this_week: WeekFigures;
  last_week: WeekFigures;
  /** Raised and resolved over the chart's period: a row per day, or per seven days from the first. */
  trend: { bucket: Bucket; rows: { start: string; raised: number; resolved: number }[] };
  target_pct: number;
  /** What open work is cut by: every campus for the manager, every active trade for an HOS or HOD. */
  open_by: 'campus' | 'trade';
  /** Live work by stage, a row for each, calm ones included. */
  open_work: { key: number; label: string; open_now: number; waiting: number; with_technician: number; on_hold: number }[];
  /** The Reports page's Facility Health rows over the week, the first few. */
  facilities: OverviewFacility[];
  /** The manager's: the Reports page's Campuses table, over the week. */
  campus_table?: OverviewCampus[];
  /** An HOS's or HOD's: their technicians over the week. */
  technicians?: TechnicianRow[];
  /** An HOS's or HOD's: the tickets waiting longest for a technician, in the
   *  list shape, each with when its clock last started. */
  waiting?: { count: number; rows: WaitingTicket[] };
}

/** A ticket waiting for a technician, since its clock last started: a reopen restarts it. */
export type WaitingTicket = Ticket & { waiting_since: string };

/** The periods the dashboard's two charts offer, in days. */
export type DashboardPeriod = 7 | 30 | 90;

export interface DashboardParams {
  trend_days: DashboardPeriod;
  open_days: DashboardPeriod | null;
}

// The shape of GET /api/v1/analytics/cover/ — technicians per (campus, trade).

export interface CoverEnvelope {
  /** The campuses the caller reads, each with its technicians counted once. */
  campuses: { id: number; name: string; technicians: number }[];
  /** Every active trade. */
  trades: { id: number; name: string; code: string }[];
  /** One per campus and trade: the technicians whose pair matches, and the live work there. */
  cells: { campus: number; trade: number; technicians: number; open: number }[];
  /** Cells with nobody to send, the campuses they fall in, and the live work in them. */
  gaps: number;
  gap_campuses: number;
  stuck: number;
}

// The shape of GET /api/v1/analytics/desk/ — the admin's dashboard.

export interface DeskEnvelope {
  escalation: {
    state: 'never' | 'failing' | 'stale' | 'running';
    last_finished_at: string | null;
    due_hos: number;
    due_hod: number;
  };
  cover: { gaps: number; gap_campuses: number; stuck: number };
  accounts_to_fix: { count: number; by_problem: Record<'no_home_campus' | 'technician_without_trade', number> };
  email_configured: boolean;
  /** Open, with nobody sent, for a day or more by the clock. */
  waiting_too_long: number;
  /** Working technicians, how many touched a ticket in the last week, and who did not. */
  technicians: { total: number; active: number; quiet: { id: number; name: string; where: string }[] };
  feedback: {
    unread: number;
    by_category: Record<'problem' | 'idea' | 'praise' | 'other', number>;
    latest: { id: number; category: 'problem' | 'idea' | 'praise' | 'other'; message: string; author_role: string; created_at: string }[];
  };
  /** Each campus: who holds its two posts, its people and buildings, the trades with nobody, the work stuck there. */
  campuses: {
    id: number;
    name: string;
    hod: string | null;
    hos: string | null;
    technicians: number;
    facilities: number;
    gaps: string[];
    stuck: number;
  }[];
}
