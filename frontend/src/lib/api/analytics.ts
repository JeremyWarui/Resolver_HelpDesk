import apiClient from './client';
import type {
  AnalyticsParams,
  AnalyticsEnvelope,
  OverviewResponse,
  TechnicianOverviewResponse,
  SLAComplianceResponse,
  ResolutionTimesResponse,
  FlowResponse,
  QualityResponse,
  DemandResponse,
  PerformanceTechniciansResponse,
  PerformanceSectionsResponse,
  PerformanceCampusDeptsResponse,
} from '@/types';

/** Unified analytics endpoint — one call, full envelope, scope from JWT.
 *  `group_by` (validated server-side against the role config) is optional. */
export async function getAnalytics(
  params?: AnalyticsParams
): Promise<AnalyticsEnvelope> {
  const { data } = await apiClient.get<AnalyticsEnvelope>('/analytics/', { params });
  return data;
}

export async function getOverview(
  params?: AnalyticsParams
): Promise<OverviewResponse | TechnicianOverviewResponse> {
  const { data } = await apiClient.get('/analytics/overview/', { params });
  return data;
}

export async function getSLACompliance(params?: AnalyticsParams): Promise<SLAComplianceResponse> {
  const { data } = await apiClient.get('/analytics/sla-compliance/', { params });
  return data;
}

export async function getResolutionTimes(params?: AnalyticsParams): Promise<ResolutionTimesResponse> {
  const { data } = await apiClient.get('/analytics/resolution-times/', { params });
  return data;
}

export async function getFlow(params?: AnalyticsParams): Promise<FlowResponse> {
  const { data } = await apiClient.get('/analytics/flow/', { params });
  return data;
}

export async function getQuality(params?: AnalyticsParams): Promise<QualityResponse> {
  const { data } = await apiClient.get('/analytics/quality/', { params });
  return data;
}

export async function getDemand(params?: AnalyticsParams): Promise<DemandResponse> {
  const { data } = await apiClient.get('/analytics/demand/', { params });
  return data;
}

export async function getPerformanceTechnicians(
  params?: AnalyticsParams
): Promise<PerformanceTechniciansResponse> {
  const { data } = await apiClient.get('/analytics/performance/technicians/', { params });
  return data;
}

export async function getPerformanceSections(
  params?: AnalyticsParams
): Promise<PerformanceSectionsResponse> {
  const { data } = await apiClient.get('/analytics/performance/sections/', { params });
  return data;
}

export async function getPerformanceCampusDepts(
  params?: AnalyticsParams
): Promise<PerformanceCampusDeptsResponse> {
  const { data } = await apiClient.get('/analytics/performance/campus-departments/', { params });
  return data;
}

// Role-scoped overview aliases — all map to /analytics/overview/ (scope comes from JWT).
// The non-technician roles always receive an OverviewResponse; the shim return types
// extend OverviewResponse (adding only optional legacy fields), so no cast is needed.
import type { HODAnalytics, SectionHeadAnalytics, ManagerAnalytics, OrganisationAnalytics } from '@/types/analytics.types';

async function getRoleOverview(params?: AnalyticsParams): Promise<OverviewResponse> {
  const { data } = await apiClient.get<OverviewResponse>('/analytics/overview/', { params });
  return data;
}

export const getHODAnalytics = (params?: AnalyticsParams): Promise<HODAnalytics> =>
  getRoleOverview(params);

export const getSectionHeadAnalytics = (params?: AnalyticsParams): Promise<SectionHeadAnalytics> =>
  getRoleOverview(params);

export const getManagerAnalytics = (params?: AnalyticsParams): Promise<ManagerAnalytics> =>
  getRoleOverview(params);

export const getOrganisationAnalytics = (params?: AnalyticsParams): Promise<OrganisationAnalytics> =>
  getRoleOverview(params);

const analyticsService = {
  getAnalytics,
  getOverview,
  getSLACompliance,
  getResolutionTimes,
  getFlow,
  getQuality,
  getDemand,
  getPerformanceTechnicians,
  getPerformanceSections,
  getPerformanceCampusDepts,
  getOrganisationAnalytics,
  getHODAnalytics,
  getSectionHeadAnalytics,
  getManagerAnalytics,
};

export default analyticsService;
