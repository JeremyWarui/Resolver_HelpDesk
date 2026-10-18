import apiClient, { rows } from './client';
import type { CodeRef, ServiceItem, Trade } from '@/types';
import type { Facility } from '@/types';

// ── Catalogue tree ───────────────────────────────────────────────────────────
//
// `GET /catalog/` returns the active trades with their service items nested.
// It takes no campus: all five trades run at every campus, so there is nothing
// for a campus to narrow.

export type CatalogItem = Pick<ServiceItem, 'id' | 'name' | 'is_active'>;

export type CatalogTrade = Trade & { items: CatalogItem[] };

/** A facility type. The wizard reads `facility_type` off an existing facility
 *  on the campus; creating the first facility of a type has no such row, so the
 *  admin form asks for the list itself. */
export async function getFacilityTypes(): Promise<CodeRef[]> {
  const { data } = await apiClient.get('/facility-types/');
  return rows<CodeRef>(data);
}

export async function getCatalog(): Promise<CatalogTrade[]> {
  const { data } = await apiClient.get('/catalog/');
  return rows<CatalogTrade>(data);
}

/** Every facility on one campus. Each row names its own type, so this one call
 *  draws both the type tiles and the facility dropdown. */
export async function getCampusFacilities(campusId: number): Promise<Facility[]> {
  const { data } = await apiClient.get('/facilities/', { params: { campus: campusId } });
  return rows<Facility>(data);
}

// ── Read ──────────────────────────────────────────────────────────────────────

export const getTrades = () => apiClient.get<Trade[]>(`/trades/`);

// ── Trade CRUD ──────────────────────────────────────────────────────────

export const createTrade = (data: {
  name: string;
  code: string;
  is_active?: boolean;
}) => apiClient.post<Trade>(`/trades/`, data);

export const updateTrade = (id: number, data: Partial<Trade>) =>
  apiClient.patch<Trade>(`/trades/${id}/`, data);

export const deleteTrade = (id: number) =>
  apiClient.delete(`/trades/${id}/`);

// ── Service item CRUD ─────────────────────────────────────────────────────────

export const createServiceItem = (data: {
  trade: number;
  name: string;
  is_active?: boolean;
}) => apiClient.post<ServiceItem>(`/service-items/`, data);

export const updateServiceItem = (id: number, data: Partial<ServiceItem>) =>
  apiClient.patch<ServiceItem>(`/service-items/${id}/`, data);

export const deleteServiceItem = (id: number) =>
  apiClient.delete(`/service-items/${id}/`);
