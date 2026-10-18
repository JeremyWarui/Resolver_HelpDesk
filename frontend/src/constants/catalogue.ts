// What a requester picks from: the trade, and the kind of place the fault is.
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
import { CHART_COLORS } from '@/constants/colors';

// ── Trades ────────────────────────────────────────────────────────────────────

/** The icon each trade is drawn with, read by both trade pickers: the
 *  requester's catalogue and the ticket wizard. An unknown code gets a spanner. */
export const TRADE_ICONS: Record<string, LucideIcon> = {
  CARP: Hammer,
  MAS: BrickWall,
  PAINT: PaintRoller,
  PLUMB: Droplets,
  ELEC: Zap,
};

/** Each trade's colour, from the chart palette, and the tint behind its icon.
 *  Keyed on the seeded code; read it through `tradeTheme`. */
const TRADE_THEMES: Record<string, { color: string; lightBg: string }> = {
  PLUMB: { color: CHART_COLORS[0], lightBg: 'bg-blue-100' },
  CARP:  { color: CHART_COLORS[1], lightBg: 'bg-green-100' },
  ELEC:  { color: CHART_COLORS[2], lightBg: 'bg-orange-100' },
  PAINT: { color: CHART_COLORS[4], lightBg: 'bg-purple-100' },
  MAS:   { color: CHART_COLORS[5], lightBg: 'bg-cyan-100' },
};

/** A trade's colour and icon tint. An unknown or missing code still renders, in grey. */
export function tradeTheme(code: string | null | undefined): { color: string; lightBg: string } {
  return TRADE_THEMES[code ?? ''] ?? { color: '#6B7280', lightBg: 'bg-gray-100' };
}

// ── Facility types ────────────────────────────────────────────────────────────

// The codes, in the order the wizard draws their tiles, most-used first.
// Adding a type on this side is the code here and its tile in
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
