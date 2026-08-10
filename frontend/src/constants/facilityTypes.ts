// The facility types, and the only place the frontend enumerates them.
//
// Source of truth is the backend: `apps/facilities/validators.py` TYPE_SPECS
// decides which codes exist and which location fields each one accepts, and
// `apps/common/management/commands/seed.py` FACILITY_TYPES names them. The
// labels below are those seeded names, so the admin pages and the API agree.
//
// Adding a type is a backend change first. On this side it needs exactly two
// edits: the codes here, and FACILITY_FORMS in TicketCreationWizard (which is
// keyed by FacilityTypeValue, so the compiler will point at it).

export const FACILITY_TYPE_CODES = [
  'office_block',
  'hostel',
  'building',
  'residential',
  'equipment',
  'grounds',
] as const;

export type FacilityTypeValue = (typeof FACILITY_TYPE_CODES)[number];

export const FACILITY_TYPE_OPTIONS: { value: FacilityTypeValue; label: string }[] = [
  { value: 'office_block', label: 'Office Block' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'building', label: 'Building' },
  { value: 'residential', label: 'Staff Quarters' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'grounds', label: 'Grounds / Field' },
];

/** Display name for a facility type code. Falls back to the raw code so a type
 *  seeded ahead of a frontend release still reads as something. */
export function facilityTypeLabel(code?: string | null): string {
  if (!code) return '—';
  return FACILITY_TYPE_OPTIONS.find((t) => t.value === code)?.label ?? code;
}
