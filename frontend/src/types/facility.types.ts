export type FacilityTypeValue = 'office_block' | 'building' | 'equipment' | 'residential' | 'grounds';

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

export interface FacilityFloor {
  id: number;
  facility: number;
  facility_name: string;
  name: string;
  order: number;
  rooms_count: number;
}

export interface FacilityRoom {
  id: number;
  floor: number;
  floor_name: string;
  name: string;
  code: string;
}

export interface LocationSelection {
  facilityId: number | null;
  facilityName: string;
  floor: string;
  room: string;
  area: string;
  isResidential: boolean;
  tenantName: string;
  unitNumber: string;
}

export interface FacilitiesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Facility[];
}
