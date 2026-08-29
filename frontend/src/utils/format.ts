/** A file size in the units a person reads. Shared by the uploader, which
 *  sizes what is being staged, and the ticket detail, which sizes what was
 *  stored — the two had a copy each. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
