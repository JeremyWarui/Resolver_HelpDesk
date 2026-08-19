// Enumerated once, in constants/facilityTypes.ts — re-exported here so
// `import type { FacilityTypeValue } from '@/types'` keeps working.
export type { FacilityTypeValue } from '@/constants/facilityTypes';
import type { FacilityTypeValue } from '@/constants/facilityTypes';

// Mirrors FacilitySerializer.Meta.fields. It previously declared `facility_code`
// and `floors_count`, which the API has never sent, and omitted the ticket
// counts and `facility_type`, which it always does — so reads of a permanently
// undefined field typechecked cleanly.
export interface Facility {
  id: number;
  name: string;
  code?: string;
  campus?: number;
  campus_name?: string | null;
  /** FK id — the writable half. */
  facility_type?: number;
  facility_type_name?: string | null;
  /** Type code, derived read-only from the FK. */
  type?: FacilityTypeValue | null;
  /** Derived from open ticket count; read-only. */
  status?: string;
  openTickets?: number;
  resolvedTickets?: number;
  closedTickets?: number;
}

