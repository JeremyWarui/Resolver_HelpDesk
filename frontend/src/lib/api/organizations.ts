import apiClient, { fetchAll, rows } from './client';
import type { Campus, CampusRosterRow } from '@/types';
import type { Facility } from '@/types';

export const campusesService = {
  getCampuses: async (): Promise<Campus[]> => {
    const { data } = await apiClient.get('/campuses/');
    return rows<Campus>(data);
  },

  /** Every campus with its head of section and technician count. Admin and manager only. */
  getRoster: (): Promise<CampusRosterRow[]> => fetchAll<CampusRosterRow>('/campus-roster/'),

  createCampus: async (payload: {
    name: string;
    code: string;
    location: string;
  }): Promise<Campus> => {
    const { data } = await apiClient.post<Campus>('/campuses/', payload);
    return data;
  },

  updateCampus: async (id: number, payload: Partial<Campus>): Promise<Campus> => {
    const { data } = await apiClient.patch<Campus>(`/campuses/${id}/`, payload);
    return data;
  },

  deleteCampus: async (id: number): Promise<void> => {
    await apiClient.delete(`/campuses/${id}/`);
  },
};

export const facilitiesService = {
  /** Every facility, paged through: the register renders the whole list, and
   *  every ticket carries a location. Scoped server-side. */
  getFacilities: (): Promise<Facility[]> => fetchAll<Facility>('/facilities/'),

  createFacility: async (payload: {
    name: string;
    campus: number;
    /** FK id, and required — the model's facility_type has no default. `type`
     *  is read-only, so sending it does nothing. */
    facility_type: number;
    code?: string;
  }): Promise<Facility> => {
    const { data } = await apiClient.post<Facility>('/facilities/', payload);
    return data;
  },

  updateFacility: async (id: number, payload: Partial<Facility>): Promise<Facility> => {
    const { data } = await apiClient.patch<Facility>(`/facilities/${id}/`, payload);
    return data;
  },

};
