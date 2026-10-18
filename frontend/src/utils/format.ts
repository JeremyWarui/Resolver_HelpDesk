/** A file size in the units a person reads. Shared by the uploader, which
 *  sizes what is being staged, and the ticket detail, which sizes what was
 *  stored. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A server percentage as the reports print it: 72.3%, or a dash for none. */
export function formatPct(value: number | null | undefined): string {
  return value == null ? '—' : `${value}%`;
}

/** Whether a resolved-on-time share falls short of the target, and so is shown in red. */
export function belowTarget(value: number | null | undefined, target: number | null | undefined): boolean {
  return target != null && value != null && value < target;
}
