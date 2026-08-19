export type DetailSheetFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  /** FacilityType FK picker — options come from GET /facility-types/ at render
   *  time, so they cannot be listed statically here. */
  | 'facility-type'
  | 'readonly'
  /** Technician section membership. View-only: section assignment is a role
   *  assignment, edited in TechnicianForm, and this endpoint never accepted it. */
  | 'sections'
  | 'related-list';

export interface DetailSheetField {
  name: string;
  label: string;
  type: DetailSheetFieldType;
  placeholder?: string;
  options?: Array<{ label: string; value: string | number }>;
}

export interface DetailSheetConfig {
  titleField: string; // which field to use as title (e.g., 'name', 'first_name')
  descriptionText: string;
  viewFields: DetailSheetField[]; // fields visible in view mode
  editFields: DetailSheetField[]; // fields editable in edit mode
  sheetWidth: string; // tailwind width class like 'sm:w-112.5 lg:w-125 xl:w-150'
}

export const DETAILS_SHEET_CONFIG: Record<string, DetailSheetConfig> = {
  technician: {
    titleField: 'first_name', // special handling for first_name + last_name
    descriptionText: 'Technician profile and assignments',
    viewFields: [
      { name: 'name', label: 'Name', type: 'readonly' },
      { name: 'username', label: 'Username', type: 'readonly' },
      { name: 'email', label: 'Email', type: 'readonly' },
      { name: 'primary_department_name', label: 'Department', type: 'readonly' },
      { name: 'sections', label: 'Sections', type: 'sections' },
    ],
    editFields: [
      { name: 'email', label: 'Email', type: 'text', placeholder: 'Enter email' },
    ],
    sheetWidth: 'sm:w-112.5 lg:w-125 xl:w-150',
  },
  section: {
    titleField: 'name',
    descriptionText: 'Section details and assigned technicians',
    viewFields: [
      { name: 'name', label: 'Name', type: 'readonly' },
      { name: 'description', label: 'Description', type: 'readonly' },
      { name: 'technicians', label: 'Technicians', type: 'related-list' },
    ],
    editFields: [
      { name: 'name', label: 'Name', type: 'text', placeholder: 'Section name' },
      { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Section description' },
    ],
    sheetWidth: 'sm:w-[450px] lg:w-[500px] xl:w-[600px]',
  },
  facility: {
    titleField: 'name',
    descriptionText: 'Facility details and configuration',
    // `type` and `status` are read-only on the serializer and `location` is not
    // a column — editing them here saved nothing. The writable half is name,
    // code and the facility_type FK.
    viewFields: [
      { name: 'name', label: 'Name', type: 'readonly' },
      { name: 'code', label: 'Code', type: 'readonly' },
      { name: 'facility_type_name', label: 'Type', type: 'readonly' },
      { name: 'campus_name', label: 'Campus', type: 'readonly' },
    ],
    editFields: [
      { name: 'name', label: 'Name', type: 'text', placeholder: 'Facility name' },
      { name: 'code', label: 'Code', type: 'text', placeholder: 'e.g. AB01' },
      { name: 'facility_type', label: 'Type', type: 'facility-type' },
    ],
    sheetWidth: 'sm:w-[450px] lg:w-[500px] xl:w-[600px]',
  },
};
