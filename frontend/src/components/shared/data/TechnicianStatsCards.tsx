import { CheckCircle, Inbox, PauseCircle, Wrench } from 'lucide-react';
import { MetricCardRow } from './MetricCard';

interface TechnicianStatsCardsProps {
  counts: { assigned?: number; in_progress?: number; pending?: number; resolved?: number };
  loading?: boolean;
}

/** The technician's own queue by status. Counts come from the ticket table beside it. */
export default function TechnicianStatsCards({
  counts,
  loading = false,
}: TechnicianStatsCardsProps) {
  const stats = [
    {
      id: 'assigned',
      title: 'New Work',
      value: counts.assigned ?? 0,
      description: 'Ready to start',
      iconBgColor: 'bg-primary/10',
      icon: <Inbox className="h-6 w-6 text-primary" />,
    },
    {
      id: 'in_progress',
      title: 'Active Jobs',
      value: counts.in_progress ?? 0,
      description: 'Working on it',
      iconBgColor: 'bg-status-progress/10',
      icon: <Wrench className="h-6 w-6 text-status-progress" />,
    },
    {
      id: 'pending',
      title: 'On Hold',
      value: counts.pending ?? 0,
      description: 'Waiting on parts or help',
      iconBgColor: 'bg-status-pending/10',
      icon: <PauseCircle className="h-6 w-6 text-status-pending" />,
    },
    {
      id: 'resolved',
      title: 'Finished',
      value: counts.resolved ?? 0,
      description: 'Work done',
      iconBgColor: 'bg-status-resolved/10',
      icon: <CheckCircle className="h-6 w-6 text-status-resolved" />,
    },
  ];

  return (
    <MetricCardRow
      stats={stats}
      loading={loading}
      gridClassName="grid-cols-2 md:grid-cols-4 gap-3 mb-4"
    />
  );
}
