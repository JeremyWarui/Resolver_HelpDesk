import { useMemo } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import ChartCard from "@/components/shared/data/ChartCard";
import { ChartPlaceholder } from "@/components/shared/data/ChartPlaceholder";
import { AppBarChart } from "@/components/shared/data/AppBarChart";
import { AppPieChart } from "@/components/shared/data/AppPieChart";
import type { FlowResponse } from "@/types/analytics.types";

interface ChartSectionProps {
  trendData: FlowResponse | null;
  trendLoading: boolean;
  categoryData: FlowResponse | null;
  categoryLoading: boolean;
  ticketTimeframe: 'day' | 'week' | 'month';
  setTicketTimeframe: (t: 'day' | 'week' | 'month') => void;
  categoryTimeframe: 'day' | 'week' | 'month';
  setCategoryTimeframe: (t: 'day' | 'week' | 'month') => void;
}

const ChartSection = ({
  trendData,
  trendLoading,
  categoryData,
  categoryLoading,
  ticketTimeframe,
  setTicketTimeframe,
  categoryTimeframe,
  setCategoryTimeframe,
}: ChartSectionProps) => {

  // Today → 1 bar; This Week → 7 day-name bars; This Month → 4 week-number bars
  const ticketsRaisedData = useMemo(() => {
    if (!trendData?.flow_trend?.length) return [];

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    if (ticketTimeframe === 'day') {
      return trendData.flow_trend.slice(-1).map(item => ({
        name: 'Today',
        tickets: item.created,
      }));
    } else if (ticketTimeframe === 'week') {
      return trendData.flow_trend.slice(-7).map(item => {
        const date = new Date(item.date);
        return { name: dayNames[date.getDay()], tickets: item.created };
      });
    } else {
      return trendData.flow_trend.slice(-4).map((item, index) => ({
        name: `Week ${index + 1}`,
        tickets: item.created,
      }));
    }
  }, [trendData, ticketTimeframe]);

  // Status distribution from the category fetch
  const pieData = (categoryData?.status_distribution ?? []).map(s => ({
    name: s.status,
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
