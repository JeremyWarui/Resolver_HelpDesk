export type DetailSheetFieldType = 'text' | 'textarea' | 'select' | 'readonly' | 'sections' | 'related-list';

export interface DetailSheetField {
  name: string;
  label: string;
  type: DetailSheetFieldType;
  readonly?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string | number }>;
  relatedDataKey?: string; // e.g., 'technicians' for section technicians list
}

export interface DetailSheetConfig {
  entityType: 'technician' | 'section' | 'facility';
  titleField: string; // which field to use as title (e.g., 'name', 'first_name')
  descriptionText: string;
  viewFields: DetailSheetField[]; // fields visible in view mode
  editFields: DetailSheetField[]; // fields editable in edit mode
  sheetWidth: string; // tailwind width class like 'sm:w-112.5 lg:w-125 xl:w-150'
  hasComplexFields?: boolean; // if true, component handles sections/related-list specially
}

export const DETAILS_SHEET_CONFIG: Record<string, DetailSheetConfig> = {
  technician: {
    entityType: 'technician',
    titleField: 'first_name', // special handling for first_name + last_name
    descriptionText: 'Technician profile and assignments',
    viewFields: [
      { name: 'name', label: 'Name', type: 'readonly' },
      { name: 'username', label: 'Username', type: 'readonly' },
      { name: 'email', label: 'Email', type: 'readonly' },
      { name: 'primary_department_name', label: 'Department', type: 'readonly' },
      { name: 'sections', label: 'Sections', type: 'readonly' },
    ],
    editFields: [
      { name: 'email', label: 'Email', type: 'text', placeholder: 'Enter email' },
      { name: 'sections', label: 'Sections', type: 'sections' },
    ],
    sheetWidth: 'sm:w-112.5 lg:w-125 xl:w-150',
    hasComplexFields: true,
  },
  section: {
    entityType: 'section',
    titleField: 'name',
    descriptionText: 'Section details and assigned technicians',
    viewFields: [
      { name: 'name', label: 'Name', type: 'readonly' },
      { name: 'description', label: 'Description', type: 'readonly' },
      { name: 'technicians', label: 'Technicians', type: 'related-list', relatedDataKey: 'technicians' },
    ],
    editFields: [
      { name: 'name', label: 'Name', type: 'text', placeholder: 'Section name' },
      { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Section description' },
    ],
    sheetWidth: 'sm:w-[450px] lg:w-[500px] xl:w-[600px]',
  },
  facility: {
    entityType: 'facility',
    titleField: 'name',
    descriptionText: 'Facility details and configuration',
    viewFields: [
      { name: 'name', label: 'Name', type: 'readonly' },
      { name: 'type', label: 'Type', type: 'readonly' },
      { name: 'location', label: 'Location', type: 'readonly' },
    ],
    editFields: [
      { name: 'name', label: 'Name', type: 'text', placeholder: 'Facility name' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { label: 'Office', value: 'Office' },
        { label: 'Housing', value: 'Housing' },
        { label: 'Industrial', value: 'Industrial' },
        { label: 'Mixed Use', value: 'Mixed Use' },
        { label: 'Conference', value: 'Conference' },
        { label: 'Technical', value: 'Technical' },
        { label: 'Parking', value: 'Parking' },
        { label: 'Food Service', value: 'Food Service' },
        { label: 'Reception', value: 'Reception' },
        { label: 'Landscape', value: 'Landscape' },
      ]},
      { name: 'location', label: 'Location', type: 'text', placeholder: 'Facility location' },
    ],
    sheetWidth: 'sm:w-[450px] lg:w-[500px] xl:w-[600px]',
  },
};
