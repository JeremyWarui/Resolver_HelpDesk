import { useQuery } from '@tanstack/react-query';
import {
  getFlow,
  getResolutionTimes,
  getQuality,
  getSLACompliance,
  getPerformanceTechnicians,
  getPerformanceSections,
  getPerformanceCampusDepts,
} from '@/lib/api/analytics';
import type {
  FlowResponse,
  ResolutionTimesResponse,
  QualityResponse,
  SLAComplianceResponse,
  PerformanceTechniciansResponse,
  PerformanceSectionsResponse,
  PerformanceCampusDeptsResponse,
  AnalyticsParams,
} from '@/types';

export function useTicketAnalytics(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<FlowResponse>({
    queryKey: ['analytics', 'flow', params],
    queryFn: () => getFlow(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export function useFlow(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<FlowResponse>({
    queryKey: ['analytics', 'flow', params],
    queryFn: () => getFlow(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export function useResolutionTimes(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<ResolutionTimesResponse>({
    queryKey: ['analytics', 'resolution-times', params],
    queryFn: () => getResolutionTimes(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export function useQuality(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<QualityResponse>({
    queryKey: ['analytics', 'quality', params],
    queryFn: () => getQuality(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export function useSLACompliance(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<SLAComplianceResponse>({
    queryKey: ['analytics', 'sla-compliance', params],
    queryFn: () => getSLACompliance(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export function usePerformanceTechnicians(params?: AnalyticsParams) {
  const { data, isLoading, error, refetch } = useQuery<PerformanceTechniciansResponse>({
    queryKey: ['analytics', 'performance', 'technicians', params],
    queryFn: () => getPerformanceTechnicians(params),
    staleTime: 2 * 60 * 1000,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export function usePerformanceSections(
  params?: AnalyticsParams,
  options?: { enabled?: boolean },
) {
  const { data, isLoading, error, refetch } = useQuery<PerformanceSectionsResponse>({
    queryKey: ['analytics', 'performance', 'sections', params],
    queryFn: () => getPerformanceSections(params),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export function usePerformanceCampusDepts(
  params?: AnalyticsParams,
  options?: { enabled?: boolean },
) {
  const { data, isLoading, error, refetch } = useQuery<PerformanceCampusDeptsResponse>({
    queryKey: ['analytics', 'performance', 'campus-departments', params],
    queryFn: () => getPerformanceCampusDepts(params),
    staleTime: 2 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
  return { data: data ?? null, loading: isLoading, error, refetch };
}

export default useTicketAnalytics;
