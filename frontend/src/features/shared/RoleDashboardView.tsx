import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Filter, Download, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AdminStatsCards,
  ManagerStatsCards,
  HODStatsCards,
  SectionHeadStatsCards,
} from "@/components/shared/data/StatCards";
import ChartSection from "@/features/admin/Dashboard/ChartsSection";
import FacilityAndWorkload from "@/features/admin/Dashboard/FacilityAndWorkload";
import { FacilityChart } from "@/features/admin/Dashboard/FacilityChart";
import TechniciansWorkload from "@/features/admin/Dashboard/TechniciansWorkload";
import RecentTicketsTable from "@/features/admin/Dashboard/RecentTickets";
import ChartCard from "@/components/shared/data/ChartCard";
import { ChartPlaceholder } from "@/components/shared/data/ChartPlaceholder";
import { AppBarChart } from "@/components/shared/data/AppBarChart";
import { FlowTrendChart } from "@/components/shared/data/TicketVolumeChart";
import DistributionCharts from "@/components/shared/data/DistributionCharts";
import ServiceHealthCards from "@/components/shared/data/ServiceHealthCards";
import InsightsPanel from "@/components/shared/data/InsightsPanel";
import LazyMount from "@/components/shared/LazyMount";
import reportsService from "@/lib/api/reports";
import type { GenerateReportParams } from "@/lib/api/reports";
import { useTicketAnalytics, useRoleAnalytics, usePerformanceCampusDepts, usePerformanceSections, useAnalytics } from "@/hooks/analytics";
import { getDemand } from "@/lib/api/analytics";

export type DashboardRole = "admin" | "manager" | "hod" | "hos";

interface RoleDashboardViewProps {
  role: DashboardRole;
  onTicketSelect?: (id: number) => void;
}

/**
 * Shared, role-scoped dashboard homepage.
 *
 * The body is lifted from the original Admin dashboard (stats cards →
 * ChartSection → FacilityAndWorkload → RecentTickets → Export dialog). Every
 * data source — the analytics charts (/analytics/flow/, /analytics/demand/),
 * the stat cards, the recent-tickets table, and the report export — scopes
 * server-side by the caller's JWT role, so the only role-specific surface here
 * is the header copy and which StatCards component renders.
 */

// Role-specific StatCards component. Rendered with NO props — each component
// either self-fetches (admin/manager) or renders its scoped placeholder.
const STAT_CARDS: Record<DashboardRole, React.ComponentType> = {
  admin: AdminStatsCards,
  manager: ManagerStatsCards,
  hod: HODStatsCards,
  hos: SectionHeadStatsCards,
};

// Role-specific header copy. Admin text is preserved exactly as before.
const HEADER_COPY: Record<DashboardRole, { title: string; subtitle: string }> = {
  admin: { title: "System Overview", subtitle: "Welcome back" },
  manager: {
    title: "Department Overview",
    subtitle: "Your department across all campuses",
  },
  hod: { title: "Campus Overview", subtitle: "Your campus department" },
  hos: { title: "Section Overview", subtitle: "Your section(s)" },
};

const RoleDashboardView = ({ role, onTicketSelect }: RoleDashboardViewProps) => {
  const StatCards = STAT_CARDS[role];
  const { subtitle } = HEADER_COPY[role];

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<GenerateReportParams['report_type'] | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Admin's seed/live data is recent, so a 7-day default looks full; the
  // department/section-scoped roles often have no tickets created in the last
  const [ticketTimeframe, setTicketTimeframe] = useState<'day' | 'week' | 'month'>('week');
  const [categoryTimeframe, setCategoryTimeframe] = useState<'day' | 'week' | 'month'>('week');
  const [facilityTimeframe, setFacilityTimeframe] = useState<'day' | 'week' | 'month'>("month");

  // Two independent fetches — trend chart and category donut have their own timeframes.
  const trendDays = ticketTimeframe === 'day' ? 1 : ticketTimeframe === 'week' ? 7 : 30;
  const categoryDays = categoryTimeframe === 'day' ? 1 : categoryTimeframe === 'week' ? 7 : 30;
  const { data: chartsAnalyticsData, loading: chartsLoading } = useTicketAnalytics({ days: trendDays });
  const { data: categoryAnalyticsData, loading: categoryLoading } = useTicketAnalytics({ days: categoryDays });

  // Demand analytics for facility chart (Phase 7: DemandResponse bound to /analytics/demand/)
  const { data: facilityAnalyticsData, loading: facilityLoading } = useRoleAnalytics(
    getDemand,
    { days: facilityTimeframe === 'day' ? 1 : facilityTimeframe === 'week' ? 7 : 30 }
  );

  // The manager + HOD dashboards are enriched with extra per-section data (all
  // scoped server-side by JWT). Manager adds per-campus charts + insights; HOD
  // adds a per-section volume chart. Admin/HOS use the recent-tickets layout.
  const isManager = role === 'manager';
  const isHOD = role === 'hod';
  const isEnriched = isManager || isHOD;
  const { data: campusDepts, loading: campusLoading } = usePerformanceCampusDepts(
    isManager ? { days: trendDays } : undefined,
    { enabled: isManager }
  );
  const campusVolume = (campusDepts?.breakdown ?? []).map((c) => ({
    name: c.campus_name,
    total: c.total,
  }));
  // Section volume/distribution is a "total tickets per section" view, not a
  // time series, so it uses a wide window (independent of the Tickets-Raised
  // timeframe dropdown) to reflect each section's overall load.
  const { data: perfSections, loading: sectionsLoading } = usePerformanceSections(
    isEnriched ? { days: 365 } : undefined,
    { enabled: isEnriched }
  );
  const sectionVolume = (perfSections?.breakdown ?? []).map((s) => ({
    name: s.section_type_name,
    total: s.total,
  }));
  // Section volume shaped for the HOD AppBarChart ({ name, tickets }).
  const sectionVolumeBar = (perfSections?.breakdown ?? []).map((s) => ({
    name: s.section_type_name,
    tickets: s.total,
  }));
  // Unified envelope for the manager insights panel (only fired for the manager
  // dashboard; HOS insights live on the HOS analytics page, not the dashboard).
  const { data: analyticsEnvelope } = useAnalytics(
    { days: trendDays, group_by: 'campus_department' },
    { enabled: isManager },
  );

  const handleExport = async () => {
    if (!selectedReportType) {
      toast.error('Please select a report type');
      return;
    }

    if (startDate || endDate) {
      if (!startDate || !endDate) {
        toast.error('Please select both start and end dates, or leave both empty for all time');
        return;
      }
      if (new Date(startDate) > new Date(endDate)) {
        toast.error('Start date must be before end date');
        return;
      }
    }

    setIsExporting(true);
    try {
      const params: GenerateReportParams = {
        report_type: selectedReportType,
        ...(startDate && endDate && { start_date: startDate, end_date: endDate }),
      };

      await reportsService.generateAndDownload(params);

      const reportNames = {
        'ticket-lifecycle': 'Ticket Lifecycle Report',
        'technician-performance': 'Technician Performance Report',
        'facility-health': 'Facility Health Report',
        'pending-analysis': 'Pending Analysis Report',
        'comprehensive': 'Comprehensive Report',
      };

      toast.success('Report downloaded successfully!', {
        description: `${reportNames[selectedReportType]} has been saved to your downloads folder`,
      });
      setShowExportDialog(false);
      setSelectedReportType(null);
      setStartDate('');
      setEndDate('');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report', {
        description: 'Please try again or contact support if the issue persists',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <div className="flex justify-between mb-2">
        <div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
          >
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => setShowExportDialog(true)}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            size="sm"
            className="flex items-center gap-1 bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </div>
      </div>

      {/* Stats Cards — current ticket state counts (live, not date-windowed) */}
      <StatCards />

      {isManager ? (
        <div className="space-y-2 mt-2">
          {/* Ticket flow over the window (created vs resolved) */}
          <FlowTrendChart
            flow={chartsAnalyticsData}
            loading={chartsLoading}
            title={`Ticket Flow — Last ${trendDays} Days`}
          />
          {/* Per-campus distribution + volume */}
          <LazyMount minHeight={340}>
            <DistributionCharts
              data={campusVolume}
              loading={campusLoading}
              distributionTitle="Campus Distribution Breakdown"
              distributionDescription="Percentage of total tickets by campus"
              volumeTitle="Campus Ticket Volume"
              volumeDescription="Number of tickets by campus"
              emptyLabel="No campus data available"
            />
          </LazyMount>
          {/* Per-section distribution + volume */}
          <LazyMount minHeight={340}>
            <DistributionCharts
              data={sectionVolume}
              loading={sectionsLoading}
              distributionTitle="Section Distribution Breakdown"
              distributionDescription="Percentage of total tickets by section"
              volumeTitle="Section Ticket Volume"
              volumeDescription="Number of tickets by section"
              emptyLabel="No section data available"
            />
          </LazyMount>
          {/* Facility demand + technician workload (department-scoped) */}
          <LazyMount minHeight={380}>
            <FacilityAndWorkload
              facilityAnalyticsData={facilityAnalyticsData}
              facilityLoading={facilityLoading}
              facilityTimeframe={facilityTimeframe}
              setFacilityTimeframe={setFacilityTimeframe}
            />
          </LazyMount>
          {/* Service-health KPIs */}
          <LazyMount minHeight={160}>
            <ServiceHealthCards params={{ days: trendDays }} />
          </LazyMount>
          {/* Actionable insights */}
          <LazyMount minHeight={200}>
            <InsightsPanel insights={analyticsEnvelope?.insights ?? []} />
          </LazyMount>
        </div>
      ) : isHOD ? (
        <>
          {/* Charts - First Row (total bar + status pie) */}
          <ChartSection
            trendData={chartsAnalyticsData}
            trendLoading={chartsLoading}
            categoryData={categoryAnalyticsData}
            categoryLoading={categoryLoading}
            ticketTimeframe={ticketTimeframe}
            setTicketTimeframe={setTicketTimeframe}
            categoryTimeframe={categoryTimeframe}
            setCategoryTimeframe={setCategoryTimeframe}
          />
          {/* Second row: per-section volume + facility chart */}
          <LazyMount minHeight={420}>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <ChartCard
                title="Section Ticket Volume"
                description="Tickets by section in your campus department"
              >
                {sectionsLoading ? (
                  <ChartPlaceholder message="Loading section data..." />
                ) : sectionVolumeBar.length === 0 ? (
                  <ChartPlaceholder message="No section data available" />
                ) : (
                  <AppBarChart data={sectionVolumeBar} dataKey="tickets" height={375} />
                )}
              </ChartCard>
              <FacilityChart
                analyticsData={facilityAnalyticsData}
                loading={facilityLoading}
                timePeriod={facilityTimeframe}
                setTimePeriod={setFacilityTimeframe}
              />
            </div>
          </LazyMount>
          {/* Third row: technician workload + recent tickets */}
          <LazyMount minHeight={220}>
            <div className="grid grid-cols-1 gap-2 mb-2">
              <TechniciansWorkload />
            </div>
          </LazyMount>
          {/* Recent tickets — Admin-style table at the bottom (campus-dept-scoped) */}
          <LazyMount minHeight={400}>
            <RecentTicketsTable role="hod" onTicketSelect={onTicketSelect} />
          </LazyMount>
        </>
      ) : (
        <>
          {/* Charts - First Row */}
          <ChartSection
            trendData={chartsAnalyticsData}
            trendLoading={chartsLoading}
            categoryData={categoryAnalyticsData}
            categoryLoading={categoryLoading}
            ticketTimeframe={ticketTimeframe}
            setTicketTimeframe={setTicketTimeframe}
            categoryTimeframe={categoryTimeframe}
            setCategoryTimeframe={setCategoryTimeframe}
          />
          {/* Charts and Tables - Second Row */}
          <LazyMount minHeight={380}>
            <FacilityAndWorkload
              facilityAnalyticsData={facilityAnalyticsData}
              facilityLoading={facilityLoading}
              facilityTimeframe={facilityTimeframe}
              setFacilityTimeframe={setFacilityTimeframe}
            />
          </LazyMount>
          <LazyMount minHeight={400}>
            <RecentTicketsTable role={role} onTicketSelect={onTicketSelect} />
          </LazyMount>
        </>
      )}

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export Dashboard Data</DialogTitle>
            <DialogDescription>
              Choose a report and optionally select a date range
            </DialogDescription>
          </DialogHeader>

          {/* Report Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Report Type</Label>
            <div className="space-y-2">
            <Button
              onClick={() => setSelectedReportType('ticket-lifecycle')}
              disabled={isExporting}
              variant={selectedReportType === 'ticket-lifecycle' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3 px-4"
            >
              <div className="text-left">
                <div className="font-semibold">Ticket Lifecycle Report</div>
                <div className="text-xs opacity-70">Complete ticket history with pending reasons</div>
              </div>
            </Button>

            <Button
              onClick={() => setSelectedReportType('technician-performance')}
              disabled={isExporting}
              variant={selectedReportType === 'technician-performance' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3 px-4"
            >
              <div className="text-left">
                <div className="font-semibold">Technician Performance</div>
                <div className="text-xs opacity-70">Performance metrics for all technicians</div>
              </div>
            </Button>

            <Button
              onClick={() => setSelectedReportType('facility-health')}
              disabled={isExporting}
              variant={selectedReportType === 'facility-health' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3 px-4"
            >
              <div className="text-left">
                <div className="font-semibold">Facility Health Report</div>
                <div className="text-xs opacity-70">Maintenance needs by facility</div>
              </div>
            </Button>

            <Button
              onClick={() => setSelectedReportType('pending-analysis')}
              disabled={isExporting}
              variant={selectedReportType === 'pending-analysis' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3 px-4"
            >
              <div className="text-left">
                <div className="font-semibold">Pending Tickets Analysis</div>
                <div className="text-xs opacity-70">All pending tickets with reasons</div>
              </div>
            </Button>

            <Button
              onClick={() => setSelectedReportType('comprehensive')}
              disabled={isExporting}
              variant={selectedReportType === 'comprehensive' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3 px-4"
            >
              <div className="text-left">
                <div className="font-semibold">Comprehensive Report</div>
                <div className="text-xs opacity-70">All reports in one Excel workbook</div>
              </div>
            </Button>
            </div>
          </div>

          {/* Date Range Selection */}
          {selectedReportType && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-600" />
                <Label className="text-sm font-medium">Date Range (Optional)</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="dashboard-start-date" className="text-xs text-gray-600">
                    Start Date
                  </Label>
                  <Input
                    id="dashboard-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={isExporting}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dashboard-end-date" className="text-xs text-gray-600">
                    End Date
                  </Label>
                  <Input
                    id="dashboard-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={isExporting}
                    className="w-full"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Leave empty to include all tickets from all time
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowExportDialog(false);
                setSelectedReportType(null);
                setStartDate('');
                setEndDate('');
              }}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || !selectedReportType}
              className="bg-primary hover:bg-primary/90"
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download Report
                </>
              )}
            </Button>
          </div>

          {isExporting && (
            <div className="flex items-center justify-center py-2 text-sm text-gray-600">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mr-2" />
              Generating report...
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default RoleDashboardView;
