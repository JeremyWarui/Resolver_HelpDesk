/** A file size in the units a person reads. Shared by the uploader, which
 *  sizes what is being staged, and the ticket detail, which sizes what was
 *  stored — the two had a copy each. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A server percentage as the reports print it: 72.3%, or a dash for none. */
export function formatPct(value: number | null | undefined): string {
  return value == null ? '—' : `${value}%`;
}

/** Seconds as decimal hours, as the reports print a time to fix: 34.6h. */
export function formatHours(seconds: number | null | undefined): string {
  return seconds == null ? '—' : `${(seconds / 3600).toFixed(1)}h`;
}
