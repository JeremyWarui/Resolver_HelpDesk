import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  TrendingUp,
  Building2,
  Download,
  RefreshCw,
  ClipboardList,
  CheckCircle2,
  Star,
  AlertTriangle,
  Inbox,
  FileText,
} from 'lucide-react';
import MetricCard from '@/components/shared/data/MetricCard';
import { DateRangeSelector } from '@/components/shared/data/DateRangeSelector';
import { useTechnicianDashboard } from '@/hooks/dashboard';
import GenerateReports from '@/features/admin/Reports/GenerateReports';
import TechReport from './TechReport';
import type { AnalyticsParams, TechnicianOverviewResponse } from '@/types';

export default function TechnicianReportsPage() {
  const [activeView, setActiveView] = useState<'overview' | 'my-stats' | 'section' | 'export'>('overview');
  const [params, setParams] = useState<AnalyticsParams>({ days: 30 });

  const { data: dashboardData } = useTechnicianDashboard(params);
  const techData = dashboardData as TechnicianOverviewResponse | null;
  const individual = techData?.individual ?? null;
  const sectional = techData?.sectional ?? null;

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30">
      {/* Sticky Header */}
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
                variant={activeView === 'my-stats' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('my-stats')}
                className="gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                My Statistics
              </Button>
              <Button
                variant={activeView === 'section' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('section')}
                className="gap-2"
              >
                <Building2 className="h-4 w-4" />
                Section Context
              </Button>
              <Button
                variant={activeView === 'export' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveView('export')}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>

            {/* Action Buttons - Right */}
            <div className="flex items-center gap-2 shrink-0">
              <DateRangeSelector value={params} onChange={setParams} />
              <Button variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 md:p-6 space-y-6">

        {/* ── OVERVIEW TAB ── */}
        {activeView === 'overview' && (
          <>
            {/* Section 1: My Performance */}
            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground">My Performance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                  title="My Open Load"
                  value={individual?.open_backlog ?? 0}
                  description="Assigned to me"
                  icon={<ClipboardList className="h-6 w-6 text-cyan-600" />}
                  iconBgColor="bg-cyan-100"
                  className="bg-card"
                />
                <MetricCard
                  title="Resolved"
                  value={individual?.resolved ?? 0}
                  description="In selected window"
                  icon={<CheckCircle2 className="h-6 w-6 text-status-resolved" />}
                  iconBgColor="bg-status-resolved/10"
                  className="bg-card"
                />
                <MetricCard
                  title="CSAT"
                  value={individual?.csat != null ? `${individual.csat.toFixed(1)}%` : '—'}
                  description="Customer satisfaction"
                  icon={<Star className="h-6 w-6 text-purple-600" />}
                  iconBgColor="bg-purple-100"
                  className="bg-card"
                />
                <MetricCard
                  title="At-Risk / Breached"
                  value={`${individual?.at_risk ?? 0} / ${individual?.breached ?? 0}`}
                  description="Approaching / past SLA"
                  icon={
                    <AlertTriangle
                      className={`h-6 w-6 ${(individual?.breached ?? 0) > 0 ? 'text-status-escalated' : 'text-amber-500'}`}
                    />
                  }
                  iconBgColor={(individual?.breached ?? 0) > 0 ? 'bg-status-escalated/10' : 'bg-amber-50'}
                  className="bg-card"
                />
              </div>
            </div>

            {/* Section 2: My Section — Context */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold text-foreground">My Section — Context</h2>
                <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">CONTEXT</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Your section's aggregate data — informational only, not your personal performance.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  title="Section Backlog"
                  value={sectional?.open_backlog ?? 0}
                  description="Total open in section"
                  icon={<Inbox className="h-6 w-6 text-muted-foreground" />}
                  iconBgColor="bg-muted"
                  className="bg-card"
                />
                <MetricCard
                  title="Net Flow"
                  value={
                    sectional != null
                      ? `${sectional.net_flow >= 0 ? '+' : ''}${sectional.net_flow}`
                      : '—'
                  }
                  description="Created minus resolved"
                  icon={<Activity className="h-6 w-6 text-muted-foreground" />}
                  iconBgColor={
                    sectional != null && sectional.net_flow > 0
                      ? 'bg-status-escalated/10'
                      : 'bg-status-resolved/10'
                  }
                  className="bg-card"
                />
                <MetricCard
                  title="Section Created"
                  value={sectional?.created ?? 0}
                  description="New tickets this window"
                  icon={<FileText className="h-6 w-6 text-muted-foreground" />}
                  iconBgColor="bg-muted"
                  className="bg-card"
                />
              </div>
            </div>

            {/* Section 3: Quick Access */}
            <div>
              <h2 className="text-lg font-semibold mb-4 text-foreground">Quick Access</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* My At-Risk Tickets */}
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveView('my-stats')}>
                  <CardHeader className="pb-4 pt-6">
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 bg-cyan-100 rounded-lg flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-cyan-600" />
                      </div>
                      {(individual?.at_risk ?? 0) > 0 && (
                        <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-200">
                          {individual?.at_risk} at risk
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="mt-6">My At-Risk Tickets</CardTitle>
                    <CardDescription className="mt-2">
                      Tickets approaching SLA deadline
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-6">
                    <Button variant="ghost" size="sm" className="w-full justify-start text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50">
                      View Report →
                    </Button>
                  </CardContent>
                </Card>

                {/* My Breached Tickets */}
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveView('my-stats')}>
                  <CardHeader className="pb-4 pt-6">
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 bg-amber-100 rounded-lg flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-amber-600" />
                      </div>
                      {(individual?.breached ?? 0) > 0 ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          {individual?.breached} breached
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          {individual?.breached ?? 0} breached
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="mt-6">My Breached Tickets</CardTitle>
                    <CardDescription className="mt-2">
                      Tickets past resolution deadline
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-6">
                    <Button variant="ghost" size="sm" className="w-full justify-start text-amber-600 hover:text-amber-700 hover:bg-amber-50">
                      View Report →
                    </Button>
                  </CardContent>
                </Card>

                {/* My Performance Stats */}
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setActiveView('my-stats')}>
                  <CardHeader className="pb-4 pt-6">
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="h-6 w-6 text-blue-600" />
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Live Data
                      </Badge>
                    </div>
                    <CardTitle className="mt-6">My Performance Stats</CardTitle>
                    <CardDescription className="mt-2">
                      Detailed resolution times, CSAT, and SLA compliance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-6">
                    <Button variant="ghost" size="sm" className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                      View Report →
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}

        {/* ── MY STATISTICS TAB ── */}
        {activeView === 'my-stats' && (
          <div>
            <TechReport />
          </div>
        )}

        {/* ── SECTION CONTEXT TAB ── */}
        {activeView === 'section' && (
          <Card>
            <CardHeader className="pb-6 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="pb-2 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-cyan-600" />
                    Section Context — Read Only
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Your section's aggregate performance. You cannot change section-level settings.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">CONTEXT</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {!sectional ? (
                <p className="text-sm text-muted-foreground">No section data available.</p>
              ) : (
                <div className="space-y-6">
                  {/* Section summary metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Section Backlog</p>
                      <p className="text-2xl font-semibold">{sectional.open_backlog}</p>
                      <p className="text-xs text-muted-foreground mt-1">Total open tickets in your section</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Flow</p>
                      <p className={`text-2xl font-semibold ${sectional.net_flow > 0 ? 'text-status-escalated' : 'text-status-resolved'}`}>
                        {sectional.net_flow >= 0 ? '+' : ''}{sectional.net_flow}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Created minus resolved this window</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Created This Window</p>
                      <p className="text-2xl font-semibold">{sectional.created}</p>
                      <p className="text-xs text-muted-foreground mt-1">New tickets submitted to your section</p>
                    </div>
                  </div>

                  {/* Status distribution */}
                  {sectional.status_distribution && sectional.status_distribution.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-foreground mb-3">Status Distribution</h3>
                      <div className="flex flex-wrap gap-2">
                        {sectional.status_distribution.map((s) => (
                          <Badge key={s.status} variant="outline" className="text-xs px-3 py-1">
                            {s.status.replace(/_/g, ' ')}: <span className="font-semibold ml-1">{s.count}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Context notice */}
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
                    <p className="text-sm text-cyan-800">
                      <span className="font-semibold">Context only:</span> These numbers reflect your entire section's workload, not just tickets assigned to you. Use the <strong>My Statistics</strong> tab for your personal performance metrics.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── EXPORT TAB ── */}
        {activeView === 'export' && (
          <div className="space-y-6">
            {/* Export Instructions */}
            <Card className="bg-linear-to-r from-cyan-50 to-sky-50 border-cyan-200">
              <CardHeader className="pb-4 pt-6">
                <CardTitle className="text-cyan-900 flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Download Your Performance Report
                </CardTitle>
                <CardDescription className="text-cyan-700 mt-2">
                  Generate formatted Excel reports with your personal metrics, resolution times, and CSAT scores
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-cyan-900 pt-2 pb-6">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Select report type and optional date range</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Reports include p50/p90 resolution times, SLA compliance, and CSAT</span>
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
