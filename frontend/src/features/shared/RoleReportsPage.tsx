import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Users,
  Building2,
  Download,
  TrendingUp,
  BarChart3,
  Activity,
  FileSpreadsheet,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Filter,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { useTicketAnalytics } from '@/hooks/analytics';
import { DateRangeSelector } from '@/components/shared/data/DateRangeSelector';
import MetricCard from '@/components/shared/data/MetricCard';
import ServiceHealthCards from '@/components/shared/data/ServiceHealthCards';
import LazyMount from '@/components/shared/LazyMount';
import TicketMetricsReport from '@/features/admin/Reports/TicketMetricsReport';
import TeamPerformanceReport from '@/features/admin/Reports/TeamPerformanceReport';
import PerformanceBreakdownReport from '@/features/admin/Reports/PerformanceBreakdownReport';
import GenerateReports from '@/features/admin/Reports/GenerateReports';
import MyPerformancePanel from '@/features/shared/MyPerformancePanel';
import { useScopedTechnicians } from '@/hooks/technicians/useScopedTechnicians';
import type { AnalyticsParams } from '@/types';

type ReportsRole = 'admin' | 'manager' | 'hod' | 'hos' | 'technician';

type TabId = 'overview' | 'tickets' | 'technicians' | 'campus' | 'export';

interface RoleCopy {
  /** Heading on the Overview tab's key-metrics block. */
  overviewHeading: string;
  /** Which tabs this role gets, in order. */
  tabs: TabId[];
}

// Data, not conditionals. Adding a role is a row here; the previous shape had
// the tab list hardcoded as JSX with an `isManager &&` in the middle of it,
// which is why the technician ended up with a whole parallel page rather than
// a sixth entry in this table.
//
// The underlying numbers are JWT-scoped server-side, so the same tab shows
// each role only what they may see — admin's copy stays exactly as it was.
// There is no 'sections' tab for anyone. A section is a campus × section type,
// and with Maintenance the only section type, sections map 1:1 to campuses —
// Section Analysis and Campus Performance drew the same five rows from two
// endpoints, the section one labelling them "NBI · Maintenance" where the
// campus one said "Nairobi". Two tabs that agree are worse than one: the reader
// has to work out whether the difference is real. Campus rows also carry
// `open_count`, which section rows do not.
//
// Adding a second section type (Security, Transport) makes the split real
// again — 5 campuses × 2 types is 10 sections against 5 campuses, and the two
// views stop agreeing. Restoring the tab is roughly twenty lines here: the
// `TabId` member, a TAB_LABEL and TAB_ICON row, the role's `tabs` entry and a
// view block passing `dimension="section"`. Nothing below the page changes —
// `PerformanceBreakdownReport` keeps its `section` spec in DIMENSIONS,
// `usePerformanceSections` and `/analytics/performance/sections/` are still
// there and still tested. What was removed is the tab, not the capability.
//
// Admin and manager see the whole organisation — one department, so the
// manager's scope filter and the admin's "everything" resolve to the same
// rows — and now get the same tabs. They previously differed: admin had
// Section Analysis but *not* Campus Performance, so the one role that can see
// every campus was the only one without the per-campus view.
const ROLE_COPY: Record<ReportsRole, RoleCopy> = {
  admin: {
    overviewHeading: 'System Overview',
    tabs: ['overview', 'tickets', 'technicians', 'campus', 'export'],
  },
  manager: {
    overviewHeading: 'Department Overview',
    tabs: ['overview', 'tickets', 'technicians', 'campus', 'export'],
  },
  // An HOD sees one Maintenance section per campus and an HOS exactly one, so
  // a per-campus breakdown is a single 100% slice for the HOS and duplicates
  // the Overview for the HOD. `role_config.py` reaches the same conclusion from
  // the other side — neither role may group by section, and both default to
  // `sub_section`. The trade split they actually need is on the Tickets tab.
  hod: {
    overviewHeading: 'Campus Department Overview',
    tabs: ['overview', 'tickets', 'technicians', 'export'],
  },
  hos: {
    overviewHeading: 'Section Overview',
    tabs: ['overview', 'tickets', 'technicians', 'export'],
  },
  // A technician gets their own numbers and the exporter. The other tabs are
  // supervisory views of other people's work — and `role_config.py` refuses to
  // serve a technician a peer breakdown anyway, so offering the tab would only
  // produce an empty one.
  technician: {
    overviewHeading: 'My Performance',
    tabs: ['overview', 'export'],
  },
};

const TAB_LABEL: Record<TabId, string> = {
  overview: 'Overview',
  tickets: 'Ticket Analytics',
  technicians: 'Technician Performance',
  campus: 'Campus Performance',
  export: 'Export Reports',
};

const TAB_ICON: Record<TabId, typeof Activity> = {
  overview: Activity,
  tickets: FileText,
  technicians: Users,
  campus: MapPin,
  export: Download,
};

interface RoleReportsPageProps {
  role: ReportsRole;
}

export default function RoleReportsPage({ role }: RoleReportsPageProps) {
  const copy = ROLE_COPY[role];
  const isTechnician = role === 'technician';
  /** Quick-access cards are shortcuts to tabs, so they must obey the same
   *  config — a card linking to a tab the role does not have is a dead end
   *  that leaves the header with nothing highlighted. */
  const has = (tab: TabId) => copy.tabs.includes(tab);
  const [activeView, setActiveView] = useState<TabId>('overview');
  const [params, setParams] = useState<AnalyticsParams>({ days: 30 });

  // Fetch analytics for overview
  const { data: ticketAnalytics } = useTicketAnalytics(params);

  // The roster is scoped server-side and includes idle technicians, which the
  // ticket-derived workload list does not.
  const { technicians } = useScopedTechnicians();

  // Three of these four cards used to be hardcoded 0 — "Active Technicians 0,
  // Service Sections 0, Facilities 0" on a page listing nine live tickets,
  // which reads as a broken system rather than a missing wire-up. Two are now
  // real numbers already in the flow payload; the third is the roster count,
  // which the Technician Performance tab was displaying correctly all along.
  //
  // Section and facility counts are gone rather than wired: they are estate
  // inventory, not report metrics, and for an HOS "Service Sections: 1" is
  // true of every HOS forever.
  const totalTickets = ticketAnalytics?.created ?? 0;
  const openBacklog = ticketAnalytics?.open_backlog ?? 0;
  const resolvedCount = ticketAnalytics?.resolved ?? 0;

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30">
      {/* Header Section */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Navigation Tabs — driven by ROLE_COPY[role].tabs */}
            <div className="flex gap-2 overflow-x-auto">
              {copy.tabs.map((tab) => {
                const Icon = TAB_ICON[tab];
                return (
                  <Button
                    key={tab}
                    variant={activeView === tab ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveView(tab)}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {TAB_LABEL[tab]}
                  </Button>
                );
              })}
            </div>

            {/* Action Buttons - Right */}
            <div className="flex items-center gap-2 shrink-0">
              <DateRangeSelector value={params} onChange={setParams} />
              <Button variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 md:p-6 space-y-6">
        {/* A technician's overview is their own performance, not an inventory
            of the estate — see MyPerformancePanel for the ordering. */}
        {activeView === 'overview' && isTechnician && (
          <MyPerformancePanel params={params} />
        )}

        {/* Overview Dashboard — supervisory roles */}
        {activeView === 'overview' && !isTechnician && (
          <>
            {/* Key Metrics Cards */}
            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground">{copy.overviewHeading}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="Total Tickets"
                  value={totalTickets}
                  description="Last 30 days"
                  icon={<FileText className="h-6 w-6 text-primary" />}
                  iconBgColor="bg-primary/10"
                  className="bg-card"
                />
                <MetricCard
                  title="Open Backlog"
                  value={openBacklog}
                  description="Still to be finished"
                  icon={<Activity className="h-6 w-6 text-status-assigned" />}
                  iconBgColor="bg-[#f3e8ff]"
                  className="bg-card"
                />
                <MetricCard
                  title="Resolved"
                  value={resolvedCount}
                  description="In the selected window"
                  icon={<CheckCircle2 className="h-6 w-6 text-status-resolved" />}
                  iconBgColor="bg-[#e5f9e5]"
                  className="bg-card"
                />
                <MetricCard
                  title="Technicians"
                  value={technicians.length}
                  description="On your roster"
                  icon={<Users className="h-6 w-6 text-status-progress" />}
                  iconBgColor="bg-[#fff9e5]"
                  className="bg-card"
                />
              </div>
            </div>

            {/* Service Health Cards */}
            <LazyMount minHeight={160}>
              <ServiceHealthCards params={params} />
            </LazyMount>

            {/* Quick Access Report Cards */}
            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground">Quick Access Reports</h2>
              {/* Three cards at most now that Section Analysis is gone, so the
                  column count is fixed rather than counted from the tab list. */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Ticket Lifecycle */}
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveView('tickets')}>
                  <CardHeader className="pb-4 pt-6">
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <BarChart3 className="h-6 w-6 text-blue-600" />
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Live Data
                      </Badge>
                    </div>
                    <CardTitle className="mt-6">Ticket Analytics</CardTitle>
                    <CardDescription className="mt-2">
                      Trends, status distribution, facility performance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-6">
                    <Button variant="ghost" size="sm" className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                      View Report →
                    </Button>
                  </CardContent>
                </Card>

                {/* Technician Performance */}
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveView('technicians')}>
                  <CardHeader className="pb-4 pt-6">
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <Users className="h-6 w-6 text-green-600" />
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Real-time
                      </Badge>
                    </div>
                    <CardTitle className="mt-6">Performance Metrics</CardTitle>
                    <CardDescription className="mt-2">
                      Resolution rates, workload, ratings by technician
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-6">
                    <Button variant="ghost" size="sm" className="w-full justify-start text-green-600 hover:text-green-700 hover:bg-green-50">
                      View Report →
                    </Button>
                  </CardContent>
                </Card>

                {/* Campus Performance */}
                {has('campus') && (
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveView('campus')}>
                    <CardHeader className="pb-4 pt-6">
                      <div className="flex items-start justify-between">
                        <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center">
                          <MapPin className="h-6 w-6 text-orange-600" />
                        </div>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          Updated
                        </Badge>
                      </div>
                      <CardTitle className="mt-6">Campus Performance</CardTitle>
                      <CardDescription className="mt-2">
                        Ticket load and SLA per campus
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 pb-6">
                      <Button variant="ghost" size="sm" className="w-full justify-start text-orange-600 hover:text-orange-700 hover:bg-orange-50">
                        View Report →
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Export Options */}
            <Card>
              <CardHeader className="pt-6 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-primary" />
                      Export & Download Reports
                    </CardTitle>
                    <CardDescription className="mt-1.5">
                      Generate custom Excel reports with date range selection
                    </CardDescription>
                  </div>
                  <Button onClick={() => setActiveView('export')} className="bg-primary hover:bg-primary/90">
                    <Download className="h-4 w-4 mr-2" />
                    Go to Exports
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30 hover:bg-gray-100 transition-colors">
                    <FileText className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium">Ticket Lifecycle</p>
                      <p className="text-xs text-muted-foreground">Full audit trail</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30 hover:bg-gray-100 transition-colors">
                    <Users className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">Tech Performance</p>
                      <p className="text-xs text-muted-foreground">Detailed metrics</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30 hover:bg-gray-100 transition-colors">
                    <Building2 className="h-8 w-8 text-purple-600" />
                    <div>
                      <p className="text-sm font-medium">Facility Health</p>
                      <p className="text-xs text-muted-foreground">By location</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30 hover:bg-gray-100 transition-colors">
                    <Clock className="h-8 w-8 text-orange-600" />
                    <div>
                      <p className="text-sm font-medium">Pending Analysis</p>
                      <p className="text-xs text-muted-foreground">With reasons</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30 hover:bg-gray-100 transition-colors">
                    <FileSpreadsheet className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-sm font-medium">Comprehensive</p>
                      <p className="text-xs text-muted-foreground">All reports</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Best Practices & Tips */}
            <Card className="bg-linear-to-br from-blue-50 to-indigo-50 border-blue-200">
              <CardHeader className="pt-6 pb-4">
                <CardTitle className="text-blue-900 flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Analytics Best Practices
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-2 pb-6">
                <div className="flex gap-3 p-3 bg-white/50 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-gray-900">Regular Monitoring</p>
                    <p className="text-sm text-gray-600">Review reports weekly to identify trends early</p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 bg-white/50 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-gray-900">Compare Timeframes</p>
                    <p className="text-sm text-gray-600">Use date range filters to compare performance periods</p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 bg-white/50 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-gray-900">Focus on Bottlenecks</p>
                    <p className="text-sm text-gray-600">Identify pending tickets and overdue items for immediate action</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Ticket Analytics View */}
        {activeView === 'tickets' && (
          <Card>
            <CardHeader className="pb-6 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="pb-2 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Ticket Analytics Dashboard
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Comprehensive ticket trends, status distribution, and facility performance analysis
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">Live Data</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <TicketMetricsReport params={params} />
            </CardContent>
          </Card>
        )}

        {/* Technician Performance View */}
        {activeView === 'technicians' && (
          <Card>
            <CardHeader className="pb-6 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="pb-2 flex items-center gap-2">
                    <Users className="h-5 w-5 text-status-resolved" />
                    Technician Performance Dashboard
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Detailed workload analysis, resolution rates, ratings, and efficiency metrics
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700">Real-time</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <TeamPerformanceReport params={params} />
            </CardContent>
          </Card>
        )}

        {/* Campus Performance View */}
        {has('campus') && activeView === 'campus' && (
          <Card>
            <CardHeader className="pb-6 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="pb-2 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-orange-600" />
                    Campus Performance Analysis
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Ticket load, escalations, and SLA compliance per campus
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-orange-50 text-orange-700">Updated</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <PerformanceBreakdownReport dimension="campus" params={params} />
            </CardContent>
          </Card>
        )}

        {/* Export Reports View */}
        {activeView === 'export' && (
          <div className="space-y-6">
            {/* Export Instructions */}
            <Card className="bg-linear-to-r from-blue-50 to-indigo-50 border-blue-200">
              <CardHeader className="pb-4 pt-6">
                <CardTitle className="text-blue-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Professional Excel Reports
                </CardTitle>
                <CardDescription className="text-blue-700 mt-2">
                  Generate formatted Excel reports with charts, pivot tables, and professional styling
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-blue-900 pt-2 pb-6">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Select report type and optional date range</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Reports include summary statistics, detailed tables, and visual formatting</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Compatible with Microsoft Excel 2013+ and Google Sheets</span>
                </div>
              </CardContent>
            </Card>

            {/* Generate Reports Component */}
            <Card>
              <CardHeader className="pb-6 pt-6">
                <CardTitle>Generate & Download Reports</CardTitle>
                <CardDescription className="mt-2">
                  Select report type, timeframe, and download professional Excel reports
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <GenerateReports />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
