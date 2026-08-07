import { FacilityChart } from "./FacilityChart";
import TechniciansWorkload from "./TechniciansWorkload";
import type { DemandResponse } from "@/types/analytics.types";

type TimePeriod = "day" | "week" | "month";

interface FacilityAndWorkloadProps {
  facilityAnalyticsData: DemandResponse | null;
  facilityLoading: boolean;
  facilityTimeframe: TimePeriod;
  setFacilityTimeframe: (timeframe: TimePeriod) => void;
}

const FacilityAndWorkload = ({
  facilityAnalyticsData,
  facilityLoading,
  facilityTimeframe,
  setFacilityTimeframe,
}: FacilityAndWorkloadProps) => {
  return (
    <div className="grid grid-cols-2 gap-2 mb-2">
      {/* Facility Distribution */}
      <FacilityChart
        analyticsData={facilityAnalyticsData}
        loading={facilityLoading}
        timePeriod={facilityTimeframe}
        setTimePeriod={setFacilityTimeframe}
      />
      {/* Technician Workload */}
      <TechniciansWorkload />
      {/* Recent Tickets */}

    </div>
  );
};

export default FacilityAndWorkload;
