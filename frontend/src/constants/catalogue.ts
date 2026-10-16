// What a requester picks from: the trade, and the kind of place the fault is.
//
// Both halves are the backend's to define and the frontend's only to draw, and
// the ticket wizard walks them one after the other — so they sit together.
//
// Trades come from the seeded `Trade.code`; facility types from
// `FACILITY_TYPES` in `apps/facilities/models.py`. Adding either is a backend
// change first; an unknown trade code still renders here rather than waiting
// for a frontend release.

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

/** Each trade's colour: an icon colour and the tint behind it. Keyed on the
 *  seeded code; an unknown code still renders, in grey. */
export const TRADE_THEMES: Record<string, { color: string; lightBg: string }> = {
  CARP:  { color: '#854F0B', lightBg: 'bg-amber-100' },
  MAS:   { color: '#5F5E5A', lightBg: 'bg-stone-200' },
  PAINT: { color: '#534AB7', lightBg: 'bg-violet-100' },
  PLUMB: { color: '#185FA5', lightBg: 'bg-blue-100' },
  ELEC:  { color: '#A37A00', lightBg: 'bg-yellow-100' },
};

export const FALLBACK_TRADE_THEME = { color: '#6B7280', lightBg: 'bg-gray-100' };

// ── Facility types ────────────────────────────────────────────────────────────

// The codes. Adding a type on this side is the code here and its tile in
// FACILITY_TILES below, which is keyed by FacilityTypeValue so the compiler
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

/** The wizard's tile per facility type. `label` is short: six tiles share a
 *  row. `hint` is the placeholder for where-in-it. */
interface FacilityTile {
  label: string;
  Icon: LucideIcon;
  hint: string;
}

export const FACILITY_TILES: Record<FacilityTypeValue, FacilityTile> = {
  office_block: { label: 'Office',     Icon: Building2, hint: 'e.g. Floor 2, Room 14' },
  hostel:       { label: 'Hostel',     Icon: BedDouble, hint: 'e.g. Room B-214' },
  building:     { label: 'Building',   Icon: Warehouse, hint: 'e.g. Main hall, rear entrance' },
  residential:  { label: 'Staff Qtrs', Icon: Home,      hint: 'e.g. Unit Q-12, ask for J. Mwangi' },
  equipment:    { label: 'Equipment',  Icon: Wrench,    hint: 'e.g. Plant room' },
  grounds:      { label: 'Grounds',    Icon: TreePine,  hint: 'e.g. Near gate B' },
};

/** Order the tiles are drawn in, most-used first. */
export const FACILITY_ORDER: FacilityTypeValue[] = [
  'office_block', 'hostel', 'building', 'residential', 'equipment', 'grounds',
];
