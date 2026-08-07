import apiClient from './client';
import type { ServiceCategory, ServiceItem } from '@/types/catalogue';

// ── Campus-filtered catalogue tree (R5 — SoT §5.3) ───────────────────────────

export interface CatalogItem {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
}

export interface CatalogCategory {
  id: number;
  name: string;
  description: string;
  location_details: boolean;
  default_priority: { id: number; name: string; rank: number };
  /** FK integer — the section type this category belongs to */
  section_type: number;
  /** Derived by backend from section_type.department — always present */
  department: { id: number; name: string; code: string };
  items: CatalogItem[];
}

/** Convenience wrapper type matching the spec shape — the API returns an array directly */
export interface CatalogResponse {
  categories: CatalogCategory[];
}

export interface FacilityTypeRef {
  id: number;
  name: string;
  code: string;
}

export async function getCatalog(campusId: number): Promise<CatalogCategory[]> {
  const { data } = await apiClient.get('/catalog/', { params: { campus: campusId } });
  return Array.isArray(data) ? data : (data.results ?? data);
}

export async function getFacilityTypes(): Promise<FacilityTypeRef[]> {
  const { data } = await apiClient.get('/facility-types/');
  return Array.isArray(data) ? data : (data.results ?? data);
}

export async function getFacilitiesByCampusAndType(
  campusId: number,
  facilityTypeCode: string
): Promise<{ id: number; name: string; code: string }[]> {
  const { data } = await apiClient.get('/facilities/', {
    params: { campus: campusId, facility_type: facilityTypeCode },
  });
  return Array.isArray(data) ? data : (data.results ?? data);
}

// ── Read ──────────────────────────────────────────────────────────────────────

export const getCategoriesBySectionType = (sectionTypeId: number) =>
  apiClient.get<ServiceCategory[]>(`/section-types/${sectionTypeId}/categories/`);

export const getAllCategories = (params?: {
  section_type?: number;
  is_active?: boolean;
}) => apiClient.get<ServiceCategory[]>(`/service-categories/`, { params });

export const getServiceItemsByCategory = (categoryId: number) =>
  apiClient.get<ServiceItem[]>(`/service-items/`, {
    params: { category: categoryId },
  });

export const getAllServiceItems = (params?: {
  category?: number;
  is_active?: boolean;
}) => apiClient.get<ServiceItem[]>(`/service-items/`, { params });

export const getServiceItemDetail = (itemId: number) =>
  apiClient.get<ServiceItem>(`/service-items/${itemId}/`);

// ── Service Category CRUD ─────────────────────────────────────────────────────

export const createCategory = (data: {
  section_type: number;
  name: string;
  description?: string;
  icon?: string;
  order?: number;
  is_active?: boolean;
  location_details?: boolean;
  default_priority_id?: number;
}) => apiClient.post<ServiceCategory>(`/service-categories/`, data);

export const updateCategory = (id: number, data: Partial<ServiceCategory>) =>
  apiClient.patch<ServiceCategory>(
    `/service-categories/${id}/`,
    data
  );

export const deleteCategory = (id: number) =>
  apiClient.delete(`/service-categories/${id}/`);

// ── Service Item CRUD ─────────────────────────────────────────────────────────

export const createServiceItem = (data: {
  category: number;
  name: string;
  description?: string;
  /** Per-item priority override; omit/null to inherit the category's default_priority. */
  default_priority_id?: number | null;
  order?: number;
  is_active?: boolean;
}) => apiClient.post<ServiceItem>(`/service-items/`, data);

export const updateServiceItem = (id: number, data: Partial<ServiceItem>) =>
  apiClient.patch<ServiceItem>(`/service-items/${id}/`, data);

export const deleteServiceItem = (id: number) =>
  apiClient.delete(`/service-items/${id}/`);
