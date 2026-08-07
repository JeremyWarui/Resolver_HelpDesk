// Analytics types — shapes matching the Phase 7 /analytics/* endpoints (SoT §5.4).
// All aggregates are server-computed; never replicate client-side.

export interface DateRange { from: string; to: string; }

export interface AnalyticsParams {
  date_from?: string;
  date_to?: string;
  days?: number;
  group_by?: string;
  granularity?: 'day' | 'week' | 'month' | 'quarter';
}

export interface StatusCount { status: string; count: number; }
export interface PriorityCount { name: string; count: number; }

export interface OverviewDelta {
  resolution_sla_pct: number | null;
  response_sla_pct: number | null;
  net_flow: number | null;
  csat: number | null;
  reopen_rate: number | null;
  created: number | null;
  resolved: number | null;
}

export interface OverviewMetrics {
  open_backlog: number;
  created: number;
  resolved: number;
  net_flow: number;
  resolution_sla_pct: number | null;
  response_sla_pct: number | null;
  csat: number | null;
  reopen_rate: number | null;
  at_risk: number;
  breached: number;
  escalation_rate: number | null;
  delta: OverviewDelta;
}

export interface SectionalMetrics {
  open_backlog: number;
  created: number;
  resolved: number;
  net_flow: number;
  status_distribution: StatusCount[];
  live_status_distribution?: StatusCount[];
  unassigned?: number;
}

export interface SectionBreakdownItem {
  section_id: number;
  section_type_name: string;
  campus_name: string;
  campus_code: string;
  total: number;
  open_count: number;
  resolved_count: number;
  escalated_count: number;
  resolution_sla_met: number;
  total_resolved_with_due: number;
}

export interface CampusBreakdownItem {
  campus_id: number;
  campus_name: string;
  campus_code: string;
  total: number;
  open_count: number;
  resolved_count: number;
  escalated_count: number;
  resolution_sla_met: number;
  total_resolved_with_due: number;
}

// GET /analytics/overview/ — non-technician roles
export interface OverviewResponse extends OverviewMetrics {
  date_range: DateRange;
  /** Windowed status counts (tickets created_at in selected window) — use for charts/trends */
  status_distribution?: StatusCount[];
  /** Live status counts across ALL scoped tickets — use for stat cards (not date-limited) */
  live_status_distribution?: StatusCount[];
  breakdown?: SectionBreakdownItem[] | CampusBreakdownItem[];
}

// GET /analytics/overview/ — technician role (two scopes, never mixed)
export interface TechnicianOverviewResponse {
  date_range: DateRange;
  individual: OverviewMetrics;
  sectional: SectionalMetrics;
  sections?: Array<{
    id: number; name: string; code: string;
    campus?: { id: number; name: string; code: string };
    department?: { id: number; name: string; code: string };
    section_type_name?: string;
  }>;
}

// GET /analytics/sla-compliance/
export interface SLAComplianceResponse {
  date_range: DateRange;
  resolution_sla_pct: number | null;
  response_sla_pct: number | null;
  at_risk: number;
  breached: number;
  delta: {
    resolution_sla_pct: number | null;
    response_sla_pct: number | null;
  };
}

// GET /analytics/resolution-times/
export interface ResolutionTimesResponse {
  date_range: DateRange;
  resolution_time_p50_seconds: number | null;
  resolution_time_p90_seconds: number | null;
  first_response_p50_seconds: number | null;
  first_response_p90_seconds: number | null;
}

// GET /analytics/flow/
export interface FlowTrendPoint { date: string; created: number; resolved: number; net: number; }

export interface FlowResponse {
  date_range: DateRange;
  open_backlog: number;
  created: number;
  resolved: number;
  net_flow: number;
  flow_trend: FlowTrendPoint[];
  status_distribution: StatusCount[];
  priority_distribution: PriorityCount[];
  delta: { created: number | null; resolved: number | null; };
}

// GET /analytics/quality/
export interface QualityResponse {
  date_range: DateRange;
  csat: number | null;
  feedback_response_rate: number | null;
  reopen_rate: number | null;
  delta: { csat: number | null; reopen_rate: number | null; };
}

// GET /analytics/demand/
export interface DemandCategoryItem { category_id: number; category_name: string; count: number; }
export interface DemandFacilityTypeItem { facility_type_id: number; facility_type_name: string; count: number; }
export interface DemandSectionItem { section_id: number; section_type_name: string; campus_name: string; count: number; }

export interface DemandResponse {
  date_range: DateRange;
  by_category: DemandCategoryItem[];
  by_facility_type: DemandFacilityTypeItem[];
  by_section: DemandSectionItem[];
}

// GET /analytics/performance/technicians/
export interface TechnicianLoadItem {
  technician_id: number;
  username: string;
  first_name: string;
  last_name: string;
  open_count: number;
}

export interface TechnicianBreakdownItem {
  technician_id: number;
  username: string;
  first_name: string;
  last_name: string;
  total_assigned: number;
  open_count: number;
  resolved_count: number;
  escalated_count: number;
}

export interface PerformanceTechniciansResponse {
  date_range: DateRange;
  technician_load: TechnicianLoadItem[];
  breakdown: TechnicianBreakdownItem[];
}

// GET /analytics/performance/sections/
export interface PerformanceSectionsResponse {
  date_range: DateRange;
  breakdown: SectionBreakdownItem[];
}

// GET /analytics/performance/campus-departments/
export interface CampusDeptBreakdownItem {
  cd_id: number;
  campus_name: string;
  dept_name: string;
  total: number;
  open_count: number;
  resolved_count: number;
  escalated_count: number;
  resolution_sla_met: number;
  total_resolved_with_due: number;
}

export interface PerformanceCampusDeptsResponse {
  date_range: DateRange;
  breakdown: CampusDeptBreakdownItem[];
}

// ── Role-specific analytics shims ─────────────────────────────────────────────
// These types satisfy existing dashboard components while the backend migrates
// to returning OverviewResponse for all role overview endpoints. Fields marked
// optional so runtime mismatch degrades gracefully to defaults/zeros.

// Shared nested types reused across role shims
interface TechWorkloadItem {
  user?: { id: number; username: string };
  technician?: { id: number; name?: string; username: string };
  open?: number;
  in_progress?: number;
  total_assigned?: number;
  resolved?: number;
}

interface SectionItem {
  section: {
    id: number; name: string; code: string; section_type?: string;
    campus?: { name: string; code: string };
  };
  total_tickets?: number;
  total?: number;
  open?: number;
  open_tickets?: number;
  resolved?: number;
  resolved_tickets?: number;
  escalated?: number;
  escalated_tickets?: number;
  avg_resolution_hours?: number;
  technician_count?: number;
  sla_24h_pct?: number;
  sla_compliance?: number;
  head_of_section?: { id: number; name?: string; username: string };
}

interface OverviewSummary {
  total?: number;
  total_tickets?: number;
  open?: number;
  open_tickets?: number;
  closed?: number;
  pending?: number;
  escalated?: number;
  escalated_tickets?: number;
  avg_resolution_hours?: number | null;
  sla_24h_pct?: number;
  in_progress?: number;
}

// Role overview shims extend OverviewResponse: the backend returns OverviewResponse
// for every role's /analytics/overview/, and these add only OPTIONAL legacy fields,
// so an OverviewResponse value satisfies them with no cast (used by dashboards that
// read OverviewResponse fields and sub-pages that still read the legacy shape).
export interface HODAnalytics extends OverviewResponse {
  overview?: OverviewSummary;
  by_section?: SectionItem[];
  technician_workload?: TechWorkloadItem[];
  campus_department?: {
    id?: number;
    campus: { name: string; code: string };
    department?: { name: string; code: string };
  };
  sections?: Array<{ id: number; name: string; code: string }>;
  period_days?: number;
}

export interface SectionHeadAnalytics extends OverviewResponse {
  overview?: OverviewSummary;
  by_section?: SectionItem[];
  technician_workload?: TechWorkloadItem[];
  sections?: Array<{ id: number; name: string; code: string }>;
  head_of_section?: { sections_count: number };
  period_days?: number;
}

export interface ManagerAnalytics extends OverviewResponse {
  overview?: OverviewSummary;
  by_campus?: Array<{
    campus: { id: number; name: string; code: string };
    open?: number;
    open_tickets?: number;
    total?: number;
    total_tickets?: number;
    escalated?: number;
    escalated_tickets?: number;
    sla_24h_pct?: number;
    sla_compliance?: number;
  }>;
  by_section?: SectionItem[];
  technicians?: TechWorkloadItem[];
  status_distribution?: Array<{ status: string; count: number }>;
  department?: { id?: number; name: string; code?: string; campuses_count: number };
  campus_breakdown?: Array<{
    campus: { id: number; name: string; code: string };
    total_tickets?: number;
    open_tickets?: number;
    sla_compliance?: number;
    avg_resolution_hours?: number | null;
  }>;
  busiest_sections?: Array<{
    section: { id: number; name: string; display_name?: string };
    department?: string;
    campus?: string;
    ticket_count?: number;
  }>;
  top_service_items?: Array<{
    id: number;
    name: string;
    category?: string;
    ticket_count?: number;
  }>;
  trend?: Array<{ period: string; count: number }>;
  period_days?: number;
}

// Alias for backwards-compat with components that import this name
export type RoleAnalyticsParams = AnalyticsParams;
export type TicketAnalyticsParams = AnalyticsParams;

// TicketAnalytics was a stale type; bind to FlowResponse for Phase 7 alignment
export type TicketAnalytics = FlowResponse;

// OrganisationAnalytics — admin-wide aggregate; mirrors ManagerAnalytics shape
export type OrganisationAnalytics = ManagerAnalytics;

// ───────────────────────────────────────────────────────────────────────────
// Unified analytics envelope — GET /api/v1/analytics/ (one endpoint, every role)
// ───────────────────────────────────────────────────────────────────────────

export interface RangeMeta {
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
}

export interface AgingBuckets {
  lt_1d: number;
  d1_3d: number;
  d3_7d: number;
  gt_7d: number;
}

/** The full headline metric set; the role config decides which are shown. */
export interface HeadlineMetrics {
  open_backlog: number | null;
  created: number | null;
  resolved: number | null;
  net_flow: number | null;
  resolution_sla_pct: number | null;
  response_sla_pct: number | null;
  resolution_time_p50_seconds: number | null;
  resolution_time_p90_seconds: number | null;
  first_response_p50_seconds: number | null;
  first_response_p90_seconds: number | null;
  at_risk: number | null;
  breached: number | null;
  escalation_rate: number | null;
  escalated_count: number | null;
  reassignment_rate: number | null;
  unassigned: number | null;
  currently_paused: number | null;
  pause_total_seconds: number | null;
  pause_avg_seconds: number | null;
  ever_paused_count: number | null;
  csat: number | null;
  csat_satisfied_pct: number | null;
  feedback_response_rate: number | null;
  reopen_rate: number | null;
  aging_buckets: AgingBuckets | null;
  delta: OverviewDelta | null;
}

/** Ticket flow by status variant — drives the stacked HOD/HOS chart. */
export interface TicketFlow {
  total: number;
  open: number;
  assigned: number;
  in_progress: number;
  pending: number;
  resolved: number;
  closed: number;
  escalated: number;
}

export interface FlowTrendPoint {
  date: string;
  created: number;
  resolved: number;
  net: number;
}

/** Breakdown row — bespoke dimensions carry section_id/campus_id etc.; generic
 *  dimensions carry {key,label}; both share the standard metric fields. */
export interface BreakdownRow {
  key?: number | string;
  label?: string;
  total?: number;
  open_count?: number;
  resolved_count?: number;
  escalated_count?: number;
  resolution_sla_met?: number;
  total_resolved_with_due?: number;
  [field: string]: number | string | null | undefined;
}

export interface Insight {
  type:
    | 'recurring_fault'
    | 'bottleneck'
    | 'sla_leak'
    | 'capacity'
    | 'csat_driver'
    | string;
  severity: 'high' | 'med' | 'low';
  message: string;
  [field: string]: unknown;
}

export interface AnalyticsEnvelope {
  scope: { role: string | null; group_by?: string | null };
  range: RangeMeta;
  /** Present for non-technician roles. */
  headline?: HeadlineMetrics;
  series: {
    flow_trend: FlowTrendPoint[];
    status_distribution?: StatusCount[];
    priority_distribution?: PriorityCount[];
  };
  /** Present for non-technician roles. */
  breakdown?: { dimension: string | null; rows: BreakdownRow[] };
  ticket_flow: TicketFlow;
  demand?: Record<string, unknown>;
  insights: Insight[];
  config_health?: Record<string, unknown>;
  /** Technician dual-scope variant (individual + sectional, never mixed). */
  individual?: HeadlineMetrics;
  sectional?: SectionalMetrics;
}
