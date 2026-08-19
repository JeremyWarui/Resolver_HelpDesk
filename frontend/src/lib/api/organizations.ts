import apiClient from './client';
import type {
  Campus,
  Department,
  Section,
  SectionType,
  CampusDepartment,
} from '@/types';
import type { Facility } from '@/types/facility.types';

/** One (technician, section, trade) membership row. */
export interface SectionTechnicianLink {
  id: number;
  user: number;
  section: number;
  sub_section: number;
  sub_section_name: string;
  added_at: string;
}

// ── Utility: normalise DRF list response (array or paginated) ─────────────────

function toArray<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results ?? [];
}

// ── Campuses ──────────────────────────────────────────────────────────────────

export const campusesService = {
  getCampuses: async (): Promise<Campus[]> => {
    const { data } = await apiClient.get('/campuses/');
    return toArray<Campus>(data);
  },

  getCampus: async (id: number): Promise<Campus> => {
    const { data } = await apiClient.get<Campus>(`/campuses/${id}/`);
    return data;
  },

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

// ── Departments ───────────────────────────────────────────────────────────────

export const departmentsService = {
  getDepartments: async (params?: { campus?: number }): Promise<Department[]> => {
    const { data } = await apiClient.get('/departments/', { params });
    return toArray<Department>(data);
  },

  getDepartment: async (id: number): Promise<Department> => {
    const { data } = await apiClient.get<Department>(`/departments/${id}/`);
    return data;
  },

  createDepartment: async (payload: {
    name: string;
    code: string;
    manager_user_id?: number | null;
  }): Promise<Department> => {
    const { data } = await apiClient.post<Department>('/departments/', payload);
    return data;
  },

  updateDepartment: async (
    id: number,
    payload: Partial<Department>
  ): Promise<Department> => {
    const { data } = await apiClient.patch<Department>(`/departments/${id}/`, payload);
    return data;
  },

  deleteDepartment: async (id: number): Promise<void> => {
    await apiClient.delete(`/departments/${id}/`);
  },
};

// ── Campus-Departments ────────────────────────────────────────────────────────

export const campusDepartmentsService = {
  getCampusDepartments: async (): Promise<CampusDepartment[]> => {
    const { data } = await apiClient.get('/campus-departments/');
    return toArray<CampusDepartment>(data);
  },

  getCampusDepartment: async (id: number): Promise<CampusDepartment> => {
    const { data } = await apiClient.get<CampusDepartment>(`/campus-departments/${id}/`);
    return data;
  },

  createCampusDepartment: async (payload: {
    campus_id: number;
    department_id: number;
    head_of_department_id?: number | null;
  }): Promise<CampusDepartment> => {
    const { data } = await apiClient.post<CampusDepartment>(
      '/campus-departments/',
      {
        campus: payload.campus_id,
        department: payload.department_id,
        head_of_department: payload.head_of_department_id ?? null,
      }
    );
    return data;
  },

  updateCampusDepartment: async (
    id: number,
    payload: Partial<CampusDepartment>
  ): Promise<CampusDepartment> => {
    const { data } = await apiClient.patch<CampusDepartment>(
      `/campus-departments/${id}/`,
      payload
    );
    return data;
  },

  deleteCampusDepartment: async (id: number): Promise<void> => {
    await apiClient.delete(`/campus-departments/${id}/`);
  },

  assignHOD: async (
    id: number,
    hodId: number | null
  ): Promise<CampusDepartment> => {
    const { data } = await apiClient.patch<CampusDepartment>(
      `/campus-departments/${id}/assign-hod/`,
      { hod_id: hodId }
    );
    return data;
  },

  getHodCandidates: async (
    campusDepartmentId: number
  ): Promise<{ id: number; name: string; username: string }[]> => {
    const { data } = await apiClient.get(
      `/campus-departments/${campusDepartmentId}/hod-candidates/`
    );
    return data;
  },
};

// ── Sections ──────────────────────────────────────────────────────────────────

export const sectionsService = {
  getSectionTypes: async (): Promise<SectionType[]> => {
    const { data } = await apiClient.get('/section-types/');
    return toArray<SectionType>(data);
  },

  createSectionType: async (payload: {
    department_id: number;
    name: string;
    code: string;
  }): Promise<SectionType> => {
    const { department_id, ...rest } = payload;
    const { data } = await apiClient.post<SectionType>('/section-types/', {
      department: department_id,
      ...rest,
    });
    return data;
  },

  updateSectionType: async (id: number, payload: Partial<{
    name: string;
    code: string;
  }>): Promise<SectionType> => {
    const { data } = await apiClient.patch<SectionType>(`/section-types/${id}/`, payload);
    return data;
  },

  deleteSectionType: async (id: number): Promise<void> => {
    await apiClient.delete(`/section-types/${id}/`);
  },

  getSections: async (params?: { department?: number; campus?: number }): Promise<Section[]> => {
    const { data } = await apiClient.get('/sections/', { params });
    return toArray<Section>(data);
  },

  getSection: async (id: number): Promise<Section> => {
    const { data } = await apiClient.get<Section>(`/sections/${id}/`);
    return data;
  },

  createSection: async (payload: {
    name: string;
    code?: string;
    campus_department: number;
    section_type: number;
  }): Promise<Section> => {
    const { data } = await apiClient.post<Section>('/sections/', payload);
    return data;
  },

  updateSection: async (id: number, payload: Partial<Section>): Promise<Section> => {
    const { data } = await apiClient.patch<Section>(`/sections/${id}/`, payload);
    return data;
  },

  deleteSection: async (id: number): Promise<void> => {
    await apiClient.delete(`/sections/${id}/`);
  },

  /** A technician's memberships in a section — one row per trade they work.
   *
   *  Not a tag list on a single membership: `(section, sub_section)` is the
   *  pair `scoped_ticket_qs` matches on, so a plumber who also does carpentry
   *  holds two rows. Adding or removing a trade is creating or deleting one. */
  getSectionTechnicians: async (sectionId: number): Promise<SectionTechnicianLink[]> => {
    const { data } = await apiClient.get(`/sections/${sectionId}/technicians/`);
    return toArray(data as never);
  },

  addSectionTechnician: async (
    sectionId: number,
    userId: number,
    subSectionId: number
  ): Promise<SectionTechnicianLink> => {
    const { data } = await apiClient.post(`/sections/${sectionId}/technicians/`, {
      user: userId,
      sub_section: subSectionId,
    });
    return data;
  },

  removeSectionTechnician: async (sectionId: number, linkId: number): Promise<void> => {
    await apiClient.delete(`/sections/${sectionId}/technicians/${linkId}/`);
  },

  /** `hos` is a plain field on Section — there is no separate assign action. */
  assignHOS: async (id: number, hosUserId: number | null): Promise<Section> => {
    const { data } = await apiClient.patch<Section>(`/sections/${id}/`, { hos: hosUserId });
    return data;
  },
};

// ── Facilities ────────────────────────────────────────────────────────────────

export const facilitiesService = {
  getFacilities: async (params?: { campus?: number }): Promise<Facility[]> => {
    const { data } = await apiClient.get('/facilities/', { params });
    return toArray<Facility>(data);
  },

  getFacility: async (id: number): Promise<Facility> => {
    const { data } = await apiClient.get<Facility>(`/facilities/${id}/`);
    return data;
  },

  getCampusFacilities: async (campusId: number): Promise<Facility[]> => {
    const { data } = await apiClient.get('/facilities/', {
      params: { campus: campusId },
    });
    return toArray<Facility>(data);
  },

  createFacility: async (payload: {
    name: string;
    campus: number;
    /** FK id, and required — the model's facility_type has no default. `type`
     *  is a read-only SerializerMethodField and sending it does nothing. */
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

  deleteFacility: async (id: number): Promise<void> => {
    await apiClient.delete(`/facilities/${id}/`);
  },

};

// ── Composite default export (matches old organizationsService shape) ──────────

const organizationsService = {
  campuses: campusesService,
  departments: departmentsService,
  campusDepartments: campusDepartmentsService,
  sections: sectionsService,
  facilities: facilitiesService,
  getSectionTypes: sectionsService.getSectionTypes,
  getDepartments: departmentsService.getDepartments,
};

export default organizationsService;
