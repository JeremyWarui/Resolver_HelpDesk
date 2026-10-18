export type DetailSheetFieldType =
  | 'text'
  /** FacilityType FK picker — options come from GET /facility-types/ at render
   *  time, so they cannot be listed statically here. */
  | 'facility-type'
  | 'readonly'
  /** The trades a technician works. View-only: a trade link is written with the
   *  role assignment. */
  | 'trades';

export interface DetailSheetField {
  name: string;
  label: string;
  type: DetailSheetFieldType;
  placeholder?: string;
}

interface DetailSheetConfig {
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
      { name: 'full_name', label: 'Name', type: 'readonly' },
      { name: 'username', label: 'Username', type: 'readonly' },
      { name: 'email', label: 'Email', type: 'readonly' },
      { name: 'primary_campus_name', label: 'Campus', type: 'readonly' },
      { name: 'trade_names', label: 'Trades', type: 'trades' },
    ],
    editFields: [
      { name: 'email', label: 'Email', type: 'text', placeholder: 'Enter email' },
    ],
    sheetWidth: 'sm:w-112.5 lg:w-125 xl:w-150',
  },
  facility: {
    titleField: 'name',
    descriptionText: 'Facility details and configuration',
    // The writable half is the name and the facility_type FK; the rest is
    // derived from the type and the campus.
    viewFields: [
      { name: 'name', label: 'Name', type: 'readonly' },
      { name: 'facility_type_name', label: 'Type', type: 'readonly' },
      { name: 'campus_name', label: 'Campus', type: 'readonly' },
    ],
    editFields: [
      { name: 'name', label: 'Name', type: 'text', placeholder: 'Facility name' },
      { name: 'facility_type', label: 'Type', type: 'facility-type' },
    ],
    sheetWidth: 'sm:w-[450px] lg:w-[500px] xl:w-[600px]',
  },
};
