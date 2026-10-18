import type { Bucket } from '@/types';

/** "Jan 15, 2025". */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "15 Jan 2025, 14:30": the 24-hour form every date and time is shown in. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-KE', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** "5m ago", "3h ago", "2d ago", then the date once it is a week old. */
export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** A duration as "2h 15m". Analytics reports every duration in seconds. */
export function formatSeconds(s: number | null): string {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** A duration in minutes as "3d 4h" — the shape an SLA target is set in. */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem === 0 ? `${h}h` : `${h}h ${rem}min`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh === 0 ? `${d}d` : `${d}d ${rh}h`;
}

/** How long until a deadline, as "3d 4h left", or "overdue by 2h" once past it. */
export function timeLeft(dueIso: string, now: number = Date.now()): string {
  const diffMs = new Date(dueIso).getTime() - now;
  const minutes = Math.max(1, Math.round(Math.abs(diffMs) / 60_000));
  return diffMs > 0 ? `${formatMinutes(minutes)} left` : `overdue by ${formatMinutes(minutes)}`;
}

/** An axis label for one trend bucket, read in the viewer's own timezone. */
export function bucketLabel(iso: string, bucket: Bucket): string {
  const date = new Date(iso);
  return bucket === 'month'
    ? date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
