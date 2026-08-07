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
  PieChart,
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
import TechnicianPerformanceReport from '@/features/admin/Reports/TechnicianPerformanceReport';
import SectionPerformanceReport from '@/features/admin/Reports/SectionPerformanceReport';
import CampusPerformanceReport from '@/features/admin/Reports/CampusPerformanceReport';
import GenerateReports from '@/features/admin/Reports/GenerateReports';
import type { AnalyticsParams } from '@/types';

type ReportsRole = 'admin' | 'manager' | 'hod' | 'hos';

interface RoleCopy {
  /** Heading on the Overview tab's key-metrics block. */
  overviewHeading: string;
}

// Only the wording changes between roles — the underlying data is JWT-scoped
// server-side, so admin's copy stays identical to its original text.
const ROLE_COPY: Record<ReportsRole, RoleCopy> = {
  admin: { overviewHeading: 'System Overview' },
  manager: { overviewHeading: 'Department Overview' },
  hod: { overviewHeading: 'Campus Department Overview' },
  hos: { overviewHeading: 'Section Overview' },
};

interface RoleReportsPageProps {
  role: ReportsRole;
}

export default function RoleReportsPage({ role }: RoleReportsPageProps) {
  const copy = ROLE_COPY[role];
  const isManager = role === 'manager';
  const [activeView, setActiveView] = useState<'overview' | 'tickets' | 'technicians' | 'sections' | 'campus' | 'export'>('overview');
  const [params, setParams] = useState<AnalyticsParams>({ days: 30 });

  // Fetch analytics for overview
  const { data: ticketAnalytics } = useTicketAnalytics(params);

  // Overview metric from FlowResponse (created in window).
  const totalTickets = ticketAnalytics?.created ?? 0;
  // Section/facility counts aren't part of FlowResponse; they belong to the demand
  // endpoint (by_section / by_facility_type). Until that's wired they stay 0 —
  // same runtime value as the old legacy-field reads, without the `as any`.
  const totalSections = 0;
  const totalFacilities = 0;

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30">
      {/* Header Section */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Navigation Tabs - Left */}
            <div className="flex gap-2 overflow-x-auto">
              <Button
                variant={activeView === 'overview' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('overview')}
                className="gap-2"
              >
                <Activity className="h-4 w-4" />
                Overview
              </Button>
              <Button
                variant={activeView === 'tickets' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('tickets')}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Ticket Analytics
              </Button>
              <Button
                variant={activeView === 'technicians' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('technicians')}
                className="gap-2"
              >
                <Users className="h-4 w-4" />
                Technician Performance
              </Button>
              <Button
                variant={activeView === 'sections' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('sections')}
                className="gap-2"
              >
                <Building2 className="h-4 w-4" />
                Section Analysis
              </Button>
              {isManager && (
                <Button
                  variant={activeView === 'campus' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveView('campus')}
                  className="gap-2"
                >
                  <MapPin className="h-4 w-4" />
                  Campus Performance
                </Button>
              )}
              <Button
                variant={activeView === 'export' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('export')}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export Reports
              </Button>
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
        {/* Overview Dashboard */}
        {activeView === 'overview' && (
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
                  title="Active Technicians"
                  value={0}
                  description="Currently assigned"
                  icon={<Users className="h-6 w-6 text-status-resolved" />}
                  iconBgColor="bg-[#e5f9e5]"
                  className="bg-card"
                />
                <MetricCard
                  title="Service Sections"
                  value={totalSections}
                  description="Operational departments"
                  icon={<Building2 className="h-6 w-6 text-status-progress" />}
                  iconBgColor="bg-[#fff9e5]"
                  className="bg-card"
                />
                <MetricCard
                  title="Facilities"
                  value={totalFacilities}
                  description="Managed locations"
                  icon={<Activity className="h-6 w-6 text-status-assigned" />}
                  iconBgColor="bg-[#f3e8ff]"
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
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isManager ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
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

                {/* Section Analysis */}
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveView('sections')}>
                  <CardHeader className="pb-4 pt-6">
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <PieChart className="h-6 w-6 text-purple-600" />
                      </div>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        Updated
                      </Badge>
                    </div>
                    <CardTitle className="mt-6">Section Performance</CardTitle>
                    <CardDescription className="mt-2">
                      Department-wise distribution and efficiency
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-6">
                    <Button variant="ghost" size="sm" className="w-full justify-start text-purple-600 hover:text-purple-700 hover:bg-purple-50">
                      View Report →
                    </Button>
                  </CardContent>
                </Card>

                {/* Campus Performance (manager only) */}
                {isManager && (
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
                        Ticket load and SLA per campus across your department
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
              <TechnicianPerformanceReport params={params} />
            </CardContent>
          </Card>
        )}

        {/* Section Performance View */}
        {activeView === 'sections' && (
          <Card>
            <CardHeader className="pb-6 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="pb-2 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-status-assigned" />
                    Section Performance Analysis
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Department-wise ticket distribution, technician assignments, and service quality ratings
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-purple-50 text-purple-700">Updated</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <SectionPerformanceReport params={params} />
            </CardContent>
          </Card>
        )}

        {/* Campus Performance View (manager only) */}
        {isManager && activeView === 'campus' && (
          <Card>
            <CardHeader className="pb-6 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="pb-2 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-orange-600" />
                    Campus Performance Analysis
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Ticket load, escalations, and SLA compliance per campus across your department
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-orange-50 text-orange-700">Updated</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <CampusPerformanceReport params={params} />
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
