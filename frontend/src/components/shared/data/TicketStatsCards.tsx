import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  FileText,
  Inbox,
  PauseCircle,
} from 'lucide-react';
import { MetricCardRow } from './MetricCard';
import { useAnalytics } from '@/hooks/useAnalytics';
import type { AnalyticsParams, Totals } from '@/types';

/** Sum the breakdown rows for one or more statuses. */
function count(byStatus: Map<string, number>, ...statuses: string[]): number {
  return statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0);
}

/**
 * The ticket overview row, the same six cards for every role. Scope comes from
 * the JWT, so an HOS gets their campus and a requester gets their own tickets.
 * Five cards count the tickets raised in the window; Overdue counts live work
 * past target, which is a different question and says so.
 */
export default function TicketStatsCards({ params }: { params?: AnalyticsParams }) {
  const { data, loading } = useAnalytics({ ...params, group_by: 'status' });
  const totals = (data?.totals ?? {}) as Partial<Totals>;
  const byStatus = new Map(data?.breakdown.map((row) => [String(row.key), row.total]) ?? []);

  const overdue = totals.overdue ?? 0;
  const stats = [
    {
      id: 'total',
      title: 'Total Tickets',
      value: totals.total ?? 0,
      description: 'Raised in this period',
      iconBgColor: 'bg-primary/10',
      icon: <FileText className="h-6 w-6 text-primary" />,
    },
    {
      id: 'open',
      title: 'Open',
      value: count(byStatus, 'open'),
      description: 'Awaiting assignment',
      iconBgColor: 'bg-status-open/10',
      icon: <AlertTriangle className="h-6 w-6 text-status-open" />,
    },
    {
      id: 'assigned',
      title: 'With a Technician',
      value: count(byStatus, 'assigned', 'in_progress'),
      description: 'Assigned or being worked on',
      iconBgColor: 'bg-status-progress/10',
      icon: <Inbox className="h-6 w-6 text-status-progress" />,
    },
    {
      id: 'pending',
      title: 'On Hold',
      value: count(byStatus, 'pending'),
      // Pending Work counts every hold; this card, only this period's tickets.
      description: "This period's tickets on hold",
      iconBgColor: 'bg-status-pending/10',
      icon: <PauseCircle className="h-6 w-6 text-status-pending" />,
    },
    {
      id: 'resolved',
      title: 'Resolved',
      value: count(byStatus, 'resolved', 'closed'),
      description: 'Finished',
      iconBgColor: 'bg-status-resolved/10',
      icon: <CheckCircle className="h-6 w-6 text-status-resolved" />,
    },
    {
      id: 'overdue',
      title: 'Overdue',
      value: overdue,
      description: 'Live and past target',
      iconBgColor: 'bg-status-escalated/10',
      icon: <AlertCircle className="h-6 w-6 text-status-escalated" />,
      badge: { value: overdue > 0 ? `${overdue} late` : 'On track', alert: overdue > 0 },
    },
  ];

  return <MetricCardRow stats={stats} loading={loading} />;
}
