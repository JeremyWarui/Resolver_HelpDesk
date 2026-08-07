import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DemandResponse } from "@/types/analytics.types";

const timePeriodLabels = {
  day: "Today",
  week: "This Week",
  month: "This Month",
};

const chartConfig = {
  value: {
    label: "Tickets",
    color: "hsl(210, 100%, 50%)", // Blue color
  },
  label: {
    color: "gray", // Changed to black
  },
} satisfies ChartConfig;

type TimePeriod = "day" | "week" | "month";

interface FacilityChartProps {
  analyticsData: DemandResponse | null;
  loading: boolean;
  timePeriod: TimePeriod;
  setTimePeriod: (period: TimePeriod) => void;
}

export function FacilityChart({
  analyticsData,
  loading,
  timePeriod,
  setTimePeriod,
}: FacilityChartProps) {

  // Facility type demand from /analytics/demand/ → by_facility_type
  const facilityData = useMemo(() => {
    if (!analyticsData?.by_facility_type?.length) return [];
    return analyticsData.by_facility_type.map(ft => ({
      name: ft.facility_type_name,
      value: ft.count,
    }));
  }, [analyticsData]);

  // Find the maximum value in the current data
  const maxValue = useMemo(() => {
    if (facilityData.length === 0) return 10;
    return Math.max(...facilityData.map((item) => item.value));
  }, [facilityData]);
  return (
    <Card className="py-7 px-2">
      <CardHeader className="flex flex-row justify-between pb-5">
        <div>
          <CardTitle className="pb-2">Facility vs Tickets</CardTitle>
          <CardDescription>Current tickets as per facility</CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              {timePeriodLabels[timePeriod]}{" "}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTimePeriod("day")}>
              Today
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTimePeriod("week")}>
              This Week
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTimePeriod("month")}>
              This Month
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[250px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading facility data...</p>
          </div>
        ) : facilityData.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        ) : (
        <ChartContainer config={chartConfig} className="min-w-[500px]">
          <BarChart
            accessibilityLayer
            data={facilityData}
            layout="vertical"
            margin={{
              left: 3,
              right: 30,
              top: 10,
              bottom: 10,
            }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "gray" }}
              width={100}
              tickFormatter={(value) => value}
            />
            <XAxis
              dataKey="value"
              type="number"
              domain={[0, maxValue]} // Set domain to go from 0 to our calculated upper limit
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Bar
              dataKey="value"
              fill="hsl(210, 100%, 50%)"
              radius={4}
            >
              <LabelList
                dataKey="value"
                position="right"
                offset={8}
                className="fill-black"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="leading-none text-muted-foreground">
          Showing tickets raised in regards to facilities
        </div>
      </CardFooter>
    </Card>
  );
}
