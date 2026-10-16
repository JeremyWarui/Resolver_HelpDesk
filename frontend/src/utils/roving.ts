import type { KeyboardEvent } from 'react';

/**
 * Arrow-key movement for a tab list or radio group whose options are sibling
 * elements in `keys` order. Selects the next option and moves focus to it, so
 * only the selected one needs to be a Tab stop.
 */
export function rovingKeyDown<K extends string>(
  event: KeyboardEvent<HTMLElement>,
  keys: readonly K[],
  current: K,
  select: (key: K) => void,
): void {
  const last = keys.length - 1;
  const at = keys.indexOf(current);
  const next =
    event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (at === last ? 0 : at + 1)
    : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (at === 0 ? last : at - 1)
    : event.key === 'Home' ? 0
    : event.key === 'End' ? last
    : null;
  if (next === null) return;
  event.preventDefault();
  select(keys[next]);
  (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
}
