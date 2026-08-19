import { useMemo } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import ChartCard from "@/components/shared/data/ChartCard";
import { ChartPlaceholder } from "@/components/shared/data/ChartPlaceholder";
import { AppBarChart } from "@/components/shared/data/AppBarChart";
import { AppPieChart } from "@/components/shared/data/AppPieChart";
import type { FlowTrendPoint, StatusCount } from "@/types/analytics.types";
import type { Ticket } from "@/types";
import { STATUS_LABELS } from "@/constants/tickets";

interface ChartSectionProps {
  // Only ever the two series, never a whole flow response — so a caller
  // holding the unified analytics envelope can pass `series` straight through.
  trend: FlowTrendPoint[] | null;
  trendLoading: boolean;
  statusDistribution: StatusCount[] | null;
  categoryLoading: boolean;
  ticketTimeframe: 'day' | 'week' | 'month';
  setTicketTimeframe: (t: 'day' | 'week' | 'month') => void;
  categoryTimeframe: 'day' | 'week' | 'month';
  setCategoryTimeframe: (t: 'day' | 'week' | 'month') => void;
}

const ChartSection = ({
  trend,
  trendLoading,
  statusDistribution,
  categoryLoading,
  ticketTimeframe,
  setTicketTimeframe,
  categoryTimeframe,
  setCategoryTimeframe,
}: ChartSectionProps) => {

  // Today → 1 bar; This Week → day-name bars; This Month → one bar per calendar week.
  //
  // `flow_trend` is one point per day and it omits days with no activity, so a
  // point's position in the array says nothing about which day or week it falls
  // in. "This Month" used to take `slice(-4)` and label the results `Week 1`
  // … `Week 4` — four *days* under four week labels, and the last four days
  // that happened to have tickets rather than the last four on the calendar.
  const ticketsRaisedData = useMemo(() => {
    if (!trend?.length) return [];

    // Parsed as local midnight: `new Date('2026-08-19')` is UTC, which lands on
    // the previous day for anyone west of Greenwich and shifts every bucket.
    const asLocalDate = (iso: string) => new Date(`${iso}T00:00:00`);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    if (ticketTimeframe === 'day') {
      return trend.slice(-1).map(item => ({
        name: 'Today',
        tickets: item.created,
      }));
    }

    if (ticketTimeframe === 'week') {
      return trend.slice(-7).map(item => ({
        name: dayNames[asLocalDate(item.date).getDay()],
        tickets: item.created,
      }));
    }

    // Bucket each day onto the Monday of its own week, so a gap in the data
    // moves nothing, and label the bar with that Monday's date — "Week 3" of
    // an unstated month told the reader less than "17 Aug" does.
    const weeks = new Map<number, number>();
    for (const item of trend) {
      const day = asLocalDate(item.date);
      const monday = new Date(day);
      monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
      const key = monday.getTime();
      weeks.set(key, (weeks.get(key) ?? 0) + item.created);
    }

    return [...weeks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([key, tickets]) => ({
        name: new Date(key).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        }),
        tickets,
      }));
  }, [trend, ticketTimeframe]);

  // Status distribution from the category fetch. Labelled through
  // STATUS_LABELS, not straight off the wire: the legend used to print the raw
  // API values — "in_progress" and "pending" — beside a table whose badges read
  // "In Progress" and "On Hold" for the same tickets.
  const pieData = (statusDistribution ?? []).map(s => ({
    name: STATUS_LABELS[s.status as Ticket['status']] ?? s.status,
    value: s.count,
  }));

  const ticketAction = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="ml-auto">
          {ticketTimeframe === 'day' ? 'Today' : ticketTimeframe === 'week' ? 'This Week' : 'This Month'}{' '}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTicketTimeframe('day')}>Today</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTicketTimeframe('week')}>This Week</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTicketTimeframe('month')}>This Month</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const categoryAction = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="ml-auto">
          {categoryTimeframe === 'day' ? 'Today' : categoryTimeframe === 'week' ? 'This Week' : 'This Month'}{' '}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setCategoryTimeframe('day')}>Today</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setCategoryTimeframe('week')}>This Week</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setCategoryTimeframe('month')}>This Month</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="grid grid-cols-7 gap-2 mb-2">
      <ChartCard className="col-span-4" title="Tickets Raised" description="Tickets raised within the period" action={ticketAction} contentClassName="p-5 pt-1">
        {trendLoading ? (
          <ChartPlaceholder message="Loading ticket data..." />
        ) : ticketsRaisedData.length === 0 ? (
          <ChartPlaceholder message="No data available" />
        ) : (
          <AppBarChart data={ticketsRaisedData} dataKey="tickets" height={375} />
        )}
      </ChartCard>

      <ChartCard className="col-span-3" title="Tickets by Status" description="Status breakdown for selected period" action={categoryAction} contentClassName="p-4 pt-0">
        {categoryLoading ? (
          <ChartPlaceholder message="Loading categories..." />
        ) : pieData.length === 0 ? (
          <ChartPlaceholder message="No data available" />
        ) : (
          <AppPieChart data={pieData} height={375} innerRadius={75} outerRadius={120} />
        )}
      </ChartCard>
    </div>
  );
};

export default ChartSection;
