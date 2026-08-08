import apiClient from './client';
import type { ServiceItem, SubSection } from '@/types/catalogue';

// ── Campus-filtered catalogue tree ───────────────────────────────────────────
//
// `GET /catalog/?campus=<id>` returns the trades that campus actually runs,
// with their service items nested. Campus is required: the catalogue is not
// global, and a campus with no Maintenance section offers nothing.

export type CatalogItem = Pick<ServiceItem, 'id' | 'name' | 'description' | 'is_active'>;

export type CatalogSubSection = SubSection & { items: CatalogItem[] };

/** A facility as the ticket wizard needs it. Each row names its own type, so
 *  one campus-wide call is enough to draw both the type tiles and the facility
 *  dropdown — there is no separate /facility-types/ fetch, and no further
 *  request as the requester clicks between tiles. */
export interface CampusFacility {
  id: number;
  name: string;
  code: string;
  /** FK id of the facility type — what the create payload sends. */
  facility_type: number;
  /** Type code, e.g. "office_block" — what the client groups on. */
  type: string;
  facility_type_name: string;
}

export async function getCatalog(campusId: number): Promise<CatalogSubSection[]> {
  const { data } = await apiClient.get('/catalog/', { params: { campus: campusId } });
  return Array.isArray(data) ? data : (data.results ?? data);
}

export async function getCampusFacilities(campusId: number): Promise<CampusFacility[]> {
  const { data } = await apiClient.get('/facilities/', { params: { campus: campusId } });
  return Array.isArray(data) ? data : (data.results ?? data);
}

// ── Read ──────────────────────────────────────────────────────────────────────

export const getSubSections = (params?: {
  section_type?: number;
  is_active?: boolean;
}) => apiClient.get<SubSection[]>(`/sub-sections/`, { params });

export const getServiceItemsBySubSection = (subSectionId: number) =>
  apiClient.get<ServiceItem[]>(`/service-items/`, {
    params: { sub_section: subSectionId },
  });

export const getAllServiceItems = (params?: {
  sub_section?: number;
  is_active?: boolean;
}) => apiClient.get<ServiceItem[]>(`/service-items/`, { params });

export const getServiceItemDetail = (itemId: number) =>
  apiClient.get<ServiceItem>(`/service-items/${itemId}/`);

// ── Sub-section CRUD ──────────────────────────────────────────────────────────

export const createSubSection = (data: {
  section_type: number;
  name: string;
  code: string;
  description?: string;
  is_active?: boolean;
  location_details?: boolean;
}) => apiClient.post<SubSection>(`/sub-sections/`, data);

export const updateSubSection = (id: number, data: Partial<SubSection>) =>
  apiClient.patch<SubSection>(`/sub-sections/${id}/`, data);

export const deleteSubSection = (id: number) =>
  apiClient.delete(`/sub-sections/${id}/`);

// ── Service item CRUD ─────────────────────────────────────────────────────────

export const createServiceItem = (data: {
  sub_section: number;
  name: string;
  description?: string;
  is_active?: boolean;
}) => apiClient.post<ServiceItem>(`/service-items/`, data);

export const updateServiceItem = (id: number, data: Partial<ServiceItem>) =>
  apiClient.patch<ServiceItem>(`/service-items/${id}/`, data);

export const deleteServiceItem = (id: number) =>
  apiClient.delete(`/service-items/${id}/`);
