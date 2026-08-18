// Enumerated once, in constants/facilityTypes.ts — re-exported here so
// `import type { FacilityTypeValue } from '@/types'` keeps working.
export type { FacilityTypeValue } from '@/constants/facilityTypes';
import type { FacilityTypeValue } from '@/constants/facilityTypes';

export interface Facility {
  id: number;
  name: string;
  facility_code?: string;
  type?: FacilityTypeValue | null;
  status?: string;
  location?: string | null;
  campus?: number;
  campus_name?: string | null;
  floors_count?: number;
}

