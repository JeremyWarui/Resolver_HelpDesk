// The reference entities: where work happens and what kind of work it is.
//
// Campus, Facility, Trade and ServiceItem are the structure tickets are routed
// through, and they are read together — a ticket names a campus, a facility and
// a service item, and the service item names the trade. They are served by
// `lib/api/organizations.ts` and `lib/api/catalogue.ts`.

import type { FacilityTypeValue } from '@/constants/catalogue';

export type { FacilityTypeValue };

/** A campus. The org tree is one level deep: five campuses, one Maintenance
 *  section each, so a campus is the whole of "where". */
export interface Campus {
  id: number;
  name: string;
  code: string;
  location: string;
}

/** A registered place. Mirrors FacilitySerializer.Meta.fields. */
export interface Facility {
  id: number;
  name: string;
  campus: number;
  campus_name: string;
  /** FK id — the writable half. */
  facility_type: number;
  /** The type's stable key, which picks the location form. The codes are
   *  enumerated once, in `constants/catalogue.ts`. */
  facility_type_code: FacilityTypeValue;
  facility_type_name: string;
}

/** A trade — Carpentry, Plumbing, and so on. Both the catalogue's top level
 *  and the technician scoping boundary, so its `code` is the one the seed, the
 *  roster and the wizard's icons share. */
export interface Trade {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  items?: ServiceItem[];
}

/** One fault a requester can report. Carries no priority: a leaking tap in a
 *  store room and one over a server rack are the same entry and nowhere near
 *  the same urgency, so the HOS sets it per ticket. */
export interface ServiceItem {
  id: number;
  trade: number;
  name: string;
  is_active: boolean;
}
