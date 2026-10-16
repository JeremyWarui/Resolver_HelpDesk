import type { Bucket } from '@/types';

/** "Jan 15, 2025". */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "Jan 15, 2025, 3:45 PM". */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "15 Jan 2025, 14:30" — the 24-hour form the audit log and feedback list read in. */
export function formatDateTimeLocal(iso: string): string {
  return new Date(iso).toLocaleString('en-KE', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** "5m ago" — the terse form a mobile row and a notification have space for. */
export function timeAgo(dateString: string): string {
  const mins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * "12 minutes ago", then a date past a day old — the long form a table cell has
 * room for, beside `timeAgo`'s terse "12m ago" for a mobile row or a
 * notification. Two formatters on purpose; they were in two files by accident.
 */
export function relativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const hours = diffMs / 3_600_000;

  if (hours < 24) {
    if (hours < 1) {
      const mins = Math.floor(diffMs / 60_000);
      if (mins < 1) return 'Just now';
      return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
    }
    const hrs = Math.floor(hours);
    return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
