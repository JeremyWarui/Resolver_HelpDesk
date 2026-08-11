import { useMemo } from 'react';
import { useTicketFilterOptions } from '@/hooks/tickets/useTicketFilterOptions';

/**
 * One trade, one colour, everywhere on the page.
 *
 * Two cards on the analytics view encode trades by colour — the technician work
 * mix and the facility chart. They picked hues independently, so Masonry was
 * blue in one and teal in the other, six inches apart. Colour that means a
 * different thing in each card is worse than no colour: the reader learns the
 * key twice and trusts it neither time.
 *
 * Slots are assigned by trade NAME, sorted — a stable property of the entity.
 * Assigning by rank would repaint every surviving series the moment a date
 * filter changed the volumes, which is the one thing categorical colour must
 * never do.
 *
 * The `--viz-*` steps are validated (lightness band, chroma floor, adjacent-pair
 * CVD separation and contrast, in both themes) — see the note in index.css.
 * There are eight; a ninth trade folds into "Other" rather than inventing a hue.
 */

export const TRADE_SLOTS = 8;
export const OTHER_TRADE = 'Other';

/**
 * Build a stable trade → CSS-variable map from whatever trades are present.
 *
 * Pass every trade name the view can show, not just the ones in the current
 * window, or the mapping shifts when the window does.
 */
export function buildTradeColours(names: Iterable<string>): Map<string, string> {
  const sorted = [...new Set(names)].sort();
  const colours = new Map<string, string>();
  sorted.slice(0, TRADE_SLOTS).forEach((name, i) => {
    colours.set(name, `var(--viz-${i + 1})`);
  });
  if (sorted.length > TRADE_SLOTS) colours.set(OTHER_TRADE, 'var(--viz-other)');
  return colours;
}

/** The bucket a trade belongs to once the slots are full. */
export function tradeBucket(name: string, colours: Map<string, string>): string {
  return colours.has(name) ? name : OTHER_TRADE;
}

/**
 * The colour domain, shared and stable.
 *
 * Building it from whatever trades a card's own data contains is the trap: the
 * work-mix card had no Painting in its window, so Plumbing took slot 4 there and
 * slot 5 in the facility chart, and the two cards disagreed again — the exact
 * failure this module exists to prevent, one level up.
 *
 * The domain is therefore the caller's *scoped trade list*, which is a property
 * of their section rather than of the current date window. It rides on
 * `useTicketFilterOptions`, a request the app already makes and caches.
 */
export function useTradeColours(): Map<string, string> {
  const { subSections } = useTicketFilterOptions();
  return useMemo(
    () => buildTradeColours(subSections.map((s) => s.name)),
    [subSections],
  );
}
