// What a requester picks from: the trade, and the kind of place the fault is.
//
// Both halves are the backend's to define and the frontend's only to draw, and
// the ticket wizard walks them one after the other — so they sit together.
//
// Trades come from the seeded `Trade.code`; facility types from
// `apps/facilities/validators.py` TYPE_SPECS, named by `seed.py`. Adding either
// is a backend change first; an unknown code still renders here rather than
// waiting for a frontend release.

import {
  Hammer, BrickWall, PaintRoller, Droplets, Zap, Wrench,
  Building2, BedDouble, Warehouse, Home, TreePine,
  type LucideIcon,
} from 'lucide-react';

// ── Trades ────────────────────────────────────────────────────────────────────

/** The icon each trade is drawn with, in the one place both pickers read — the
 *  requester's catalogue and the ticket wizard. They are the two screens that
 *  pick a trade, so a trade added to one and missed on the other is exactly the
 *  drift nobody notices: both fall back silently to a spanner. */
export const TRADE_ICONS: Record<string, LucideIcon> = {
  CARP: Hammer,
  MAS: BrickWall,
  PAINT: PaintRoller,
  PLUMB: Droplets,
  ELEC: Zap,
};

/** The icon for a trade code, or the spanner for one this build has not met.
 *
 *  Index `TRADE_ICONS` directly when the result is rendered as a component:
 *  `react-hooks/static-components` reads a *called* function returning a
 *  component as one created during render. This form is for building data,
 *  like the wizard's tile list. */
export function tradeIcon(code: string): LucideIcon {
  return TRADE_ICONS[code] ?? Wrench;
}

// ── Facility types ────────────────────────────────────────────────────────────

// The codes, and nothing else. Display names arrive with GET /facility-types/
// and are read through `useFacilityTypes()`, so the seeded name is the only
// one — a second copy could only ever disagree with it.
//
// Adding a type is one edit on this side: the code here and its entry in
// FACILITY_FORMS below, which is keyed by FacilityTypeValue so the compiler
// points at the gap.
export const FACILITY_TYPE_CODES = [
  'office_block',
  'hostel',
  'building',
  'residential',
  'equipment',
  'grounds',
] as const;

export type FacilityTypeValue = (typeof FACILITY_TYPE_CODES)[number];

/** The location form per facility type — mirrors validators.py TYPE_SPECS.
 *  `label` is short on purpose: the six tiles sit on one row. `required` and
 *  `optional` are the type's entry in TYPE_SPECS; anything else is refused. */
interface FacilityForm {
  label: string;
  Icon: LucideIcon;
  required: string[];
  optional: string[];
}

export const FACILITY_FORMS: Record<FacilityTypeValue, FacilityForm> = {
  office_block: { label: 'Office',     Icon: Building2, required: ['floor', 'room'], optional: ['area'] },
  hostel:       { label: 'Hostel',     Icon: BedDouble, required: ['room_number'],   optional: ['area'] },
  building:     { label: 'Building',   Icon: Warehouse, required: [],                optional: ['room', 'area'] },
  residential:  { label: 'Staff Qtrs', Icon: Home,      required: ['tenant_name'],   optional: ['unit_number'] },
  equipment:    { label: 'Equipment',  Icon: Wrench,    required: [],                optional: [] },
  grounds:      { label: 'Grounds',    Icon: TreePine,  required: [],                optional: ['landmark'] },
};

/** Order the tiles are drawn in, most-used first. Typed against the shared
 *  code list, so a type added there without a form here fails to compile. */
export const FACILITY_ORDER: FacilityTypeValue[] = [
  'office_block', 'hostel', 'building', 'residential', 'equipment', 'grounds',
];

// One entry per field in TYPE_SPECS' `known` sets. Anything not there is a
// field the server refuses, so a label for it can never be shown.
const FIELD_LABELS: Record<string, { label: string; placeholder: string }> = {
  floor:       { label: 'Floor',       placeholder: 'e.g. Ground, 1st' },
  room:        { label: 'Room',        placeholder: 'e.g. Room 14' },
  area:        { label: 'Area',        placeholder: 'e.g. Boardroom' },
  room_number: { label: 'Room number', placeholder: 'e.g. B-214' },
  tenant_name: { label: 'Tenant name', placeholder: 'Who can let the technician in' },
  unit_number: { label: 'Unit / house no.', placeholder: 'e.g. Q-12' },
  landmark:    { label: 'Landmark',    placeholder: 'e.g. Near gate B' },
};

export function fieldMeta(name: string) {
  return FIELD_LABELS[name] ?? { label: name.replace(/_/g, ' '), placeholder: '' };
}
