export interface Campus {
  id: number
  name: string
  code: string
  location: string
  is_headquarters: boolean
  is_active: boolean
}

export interface DepartmentType {
  id: number
  name: string
  code: string
  description: string
  is_active: boolean
}

export interface SectionType {
  id: number
  name: string
  code: string
  department_type?: number
  department_type_name?: string
  description?: string
  staff_label?: 'Technician' | 'Officer' | string
  is_active?: boolean
  /** Specialty child SectionTypes point at their top-level parent (R18) —
   *  null for top-level types. Never more than 2 levels deep. */
  parent_id?: number | null
  parent_name?: string | null
}

export interface Department {
  id: number
  department_type: number | null
  department_type_name: string | null
  campus: number
  campus_name: string
  head_of_department: { id: number; username: string; name: string } | null
  name: string
  code: string
  is_active: boolean
  /** Present on the global /departments/ list endpoint (DepartmentSerializer) — every
   *  campus this department has a CampusDepartment presence on. Absent department is
   *  campus-scoped elsewhere (e.g. CampusDepartment-derived shapes). */
  campuses?: { campus_department_id: number; id: number; name: string; code: string }[]
  heads_of_department?: {
    campus_department_id: number
    campus: string
    hod: { id: number; name: string; username: string }
  }[]
}

export interface Section {
  id: number
  section_type: SectionType | null
  section_type_detail?: SectionType | null
  department: number | { id: number; name: string; code: string }
  department_name?: string
  campus?: { id: number; name: string; code: string } | null
  campus_name?: string | null
  head_of_section: number | null
  name: string
  code: string | null
  description?: string
  technician_count?: number
  is_active?: boolean
}

export interface CampusDepartment {
  id: number;
  campus: { id: number; code: string; name: string };
  department: { id: number; code: string; name: string };
  head_of_department: { id: number; username: string; name: string } | null;
}
