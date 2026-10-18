import apiClient, { fetchAll, rows } from './client';
import type { Campus, CampusRosterRow, Facility } from '@/types';

export async function getCampuses(): Promise<Campus[]> {
  const { data } = await apiClient.get('/campuses/');
  return rows<Campus>(data);
}

/** Every campus with its head of section and technician count. Admin and manager only. */
export function getCampusRoster(): Promise<CampusRosterRow[]> {
  return fetchAll<CampusRosterRow>('/campus-roster/');
}

export async function createCampus(payload: { name: string; code: string; location: string }): Promise<Campus> {
  const { data } = await apiClient.post<Campus>('/campuses/', payload);
  return data;
}

export async function updateCampus(id: number, payload: Partial<Campus>): Promise<Campus> {
  const { data } = await apiClient.patch<Campus>(`/campuses/${id}/`, payload);
  return data;
}

export async function deleteCampus(id: number): Promise<void> {
  await apiClient.delete(`/campuses/${id}/`);
}

/** Every facility, paged through: the register renders the whole list, and
 *  every ticket carries a location. Scoped server-side. */
export function getFacilities(): Promise<Facility[]> {
  return fetchAll<Facility>('/facilities/');
}

/** `facility_type` is the FK id, and required: the model has no default. */
export async function createFacility(payload: { name: string; campus: number; facility_type: number }): Promise<Facility> {
  const { data } = await apiClient.post<Facility>('/facilities/', payload);
  return data;
}

export async function updateFacility(id: number, payload: Partial<Facility>): Promise<Facility> {
  const { data } = await apiClient.patch<Facility>(`/facilities/${id}/`, payload);
  return data;
}
