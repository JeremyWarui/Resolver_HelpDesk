/**
 * Format a date string to a human-readable format
 * @param dateString ISO date string
 * @returns Formatted date string (e.g., "Jan 15, 2025")
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date string to include time
 * @param dateString ISO date string
 * @returns Formatted date and time string (e.g., "Jan 15, 2025 at 3:45 PM")
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Compact relative time — "5m ago" / "3h ago" / "2d ago".
 *
 * The terse form the mobile shell and the notification list want, where a row
 * is a few characters wide. Was defined identically in three mobile components.
 */
export function timeAgo(dateString: string): string {
  const mins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * A duration in seconds, as "2h 15m" — the shape analytics returns for
 * average response and resolution times.
 *
 * Distinct from `fmtMins` in SLARulesPage (minutes in, rolls up to days, for
 * SLA thresholds) and `formatDuration` in SLACountdown (milliseconds in, for a
 * live countdown). Three formats because they answer three questions; this one
 * was the only genuine duplicate, defined identically in two report views.
 */
export function formatSeconds(s: number | null): string {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}


/**
 * Local 24-hour timestamp — "15 Jan 2025, 14:30".
 *
 * en-KE and `hour12: false` because that is how the stamps read on site; the
 * en-US `formatDateTime` above is the 12-hour variant used elsewhere. Was
 * defined identically in the feedback tab and the audit log.
 */
export function formatDateTimeLocal(iso: string): string {
  return new Date(iso).toLocaleString('en-KE', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
