import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Download, FileSpreadsheet, TrendingUp, Clock, CheckCircle, AlertCircle, Calendar, ShieldCheck, Star, Activity } from 'lucide-react';
import MetricCard from '@/components/shared/data/MetricCard';
import { KPICardGrid, type KPIMetric } from '@/components/shared/data/KPICardGrid';
import { DateRangeSelector } from '@/components/shared/data/DateRangeSelector';
import reportsService, { type GenerateReportParams } from '@/lib/api/reports';
import { useTechnicianDashboard } from '@/hooks/dashboard';
import { useResolutionTimes, useQuality } from '@/hooks/analytics';
import { useAuth } from '@/hooks/useAuth';
import type { AnalyticsParams, TechnicianOverviewResponse } from '@/types';

function formatSeconds(s: number | null): string {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const TechReport = () => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [analyticsParams, setAnalyticsParams] = useState<AnalyticsParams>({ days: 30 });
  const { user } = useAuth();

  const { data: dashboardData, loading } = useTechnicianDashboard(analyticsParams);
  const { data: resTimes, loading: resLoading } = useResolutionTimes(analyticsParams);
  const { data: quality, loading: qualityLoading } = useQuality(analyticsParams);

  const technicianId = user?.id;
  const [showDateDialog, setShowDateDialog] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // TechnicianOverviewResponse has .individual and .sectional
  const techData = dashboardData as TechnicianOverviewResponse | null;
  const individual = techData?.individual ?? null;
  const sectional = techData?.sectional ?? null;

  // Individual KPIs — "My Performance"
  const individualKPIs: KPIMetric[] = individual
    ? [
        {
          label: 'My Open Load',
          value: individual.open_backlog,
          icon: <TrendingUp className="h-4 w-4" />,
          colorClass: 'bg-status-open/10 text-status-open',
          description: 'tickets currently assigned to me',
        },
        {
          label: 'Resolved',
          value: individual.resolved,
          icon: <CheckCircle className="h-4 w-4" />,
          colorClass: 'bg-status-resolved/10 text-status-resolved',
          trend: individual.delta.resolved ?? undefined,
        },
        {
          label: 'At Risk / Breached',
          value: `${individual.at_risk} / ${individual.breached}`,
          icon: <AlertCircle className="h-4 w-4" />,
          colorClass: individual.breached > 0
            ? 'bg-status-escalated/10 text-status-escalated'
            : 'bg-amber-500/10 text-amber-500',
        },
        {
          label: 'CSAT',
          value: individual.csat != null ? `${individual.csat.toFixed(1)}%` : '—',
          icon: <Star className="h-4 w-4" />,
          colorClass: 'bg-purple-500/10 text-purple-500',
          trend: individual.delta.csat ?? undefined,
        },
      ]
    : [];

  // Resolution time KPIs
  const resolutionKPIs: KPIMetric[] = [
    {
      label: 'Resolution p50',
      value: formatSeconds(resTimes?.resolution_time_p50_seconds ?? null),
      icon: <Clock className="h-4 w-4" />,
      colorClass: 'bg-primary/10 text-primary',
      description: 'Median — my resolution time',
    },
    {
      label: 'Resolution p90',
      value: formatSeconds(resTimes?.resolution_time_p90_seconds ?? null),
      icon: <Clock className="h-4 w-4" />,
      colorClass: 'bg-status-progress/10 text-status-progress',
      description: '90th percentile resolution',
    },
    {
      label: 'Response p50',
      value: formatSeconds(resTimes?.first_response_p50_seconds ?? null),
      icon: <Activity className="h-4 w-4" />,
      colorClass: 'bg-primary/10 text-primary',
      description: 'Median first response time',
    },
    {
      label: 'Response p90',
      value: formatSeconds(resTimes?.first_response_p90_seconds ?? null),
      icon: <Activity className="h-4 w-4" />,
      colorClass: 'bg-status-progress/10 text-status-progress',
      description: '90th percentile first response',
    },
  ];

  // SLA KPIs
  const slaKPIs: KPIMetric[] = individual
    ? [
        {
          label: 'Resolution SLA',
          value: individual.resolution_sla_pct != null ? `${individual.resolution_sla_pct.toFixed(1)}%` : '—',
          icon: <ShieldCheck className="h-4 w-4" />,
          colorClass: (individual.resolution_sla_pct ?? 0) >= 95
            ? 'bg-status-resolved/10 text-status-resolved'
            : 'bg-status-escalated/10 text-status-escalated',
          trend: individual.delta.resolution_sla_pct ?? undefined,
        },
        {
          label: 'Response SLA',
          value: individual.response_sla_pct != null ? `${individual.response_sla_pct.toFixed(1)}%` : '—',
          icon: <ShieldCheck className="h-4 w-4" />,
          colorClass: (individual.response_sla_pct ?? 0) >= 95
            ? 'bg-status-resolved/10 text-status-resolved'
            : 'bg-status-escalated/10 text-status-escalated',
          trend: individual.delta.response_sla_pct ?? undefined,
        },
      ]
    : [];

  const handleDownloadReport = async () => {
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

    setIsDownloading(true);
    try {
      const params: GenerateReportParams = {
        report_type: 'technician-performance',
        ...(startDate && endDate && { start_date: startDate, end_date: endDate }),
        ...(technicianId && { technician_id: technicianId }),
      };

      await reportsService.generateAndDownload(params);

      toast.success('Report downloaded successfully!', {
        description: technicianId
          ? 'Your performance report has been saved to your downloads folder'
          : 'All technicians performance report has been saved to your downloads folder',
      });
      setShowDateDialog(false);
      setStartDate('');
      setEndDate('');
    } catch (error) {
      console.error('Error downloading report:', error);
      toast.error('Failed to download report', {
        description: 'Please try again or contact support if the issue persists',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-muted/30 p-4 md:p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-muted/30 p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            View your ticket statistics and download detailed performance reports
          </p>
        </div>
        <DateRangeSelector value={analyticsParams} onChange={setAnalyticsParams} />
      </div>

      {/* ── MY PERFORMANCE (individual scope) ── */}
      <section>
        <h2 className="text-base font-semibold mb-3">My Performance</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Tickets assigned to me in the selected window — individual scope, server-enforced.
        </p>

        {/* Individual KPIs */}
        <KPICardGrid
          metrics={individualKPIs}
          loading={loading || !individual}
          columns={4}
        />

        {/* SLA KPIs */}
        {slaKPIs.length > 0 && (
          <div className="mt-4">
            <KPICardGrid metrics={slaKPIs} loading={false} columns={2} />
          </div>
        )}
      </section>

      {/* Resolution Times — p50 and p90 (never mean) */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4 pt-6 px-6">
          <CardTitle className="text-base">Resolution Times</CardTitle>
          <CardDescription>p50 = median, p90 = 90th percentile — individual scope</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          <KPICardGrid
            metrics={resolutionKPIs}
            loading={resLoading || !resTimes}
            columns={4}
          />
        </CardContent>
      </Card>

      {/* Quality (CSAT) */}
      {quality && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-4 pt-6 px-6">
            <CardTitle className="text-base">Customer Satisfaction</CardTitle>
            <CardDescription>CSAT and reopen rate for my tickets</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <KPICardGrid
              metrics={[
                {
                  label: 'CSAT',
                  value: quality.csat != null ? `${quality.csat.toFixed(1)}%` : '—',
                  icon: <Star className="h-4 w-4" />,
                  colorClass: 'bg-purple-500/10 text-purple-500',
                  trend: quality.delta.csat ?? undefined,
                },
                {
                  label: 'Reopen Rate',
                  value: quality.reopen_rate != null ? `${quality.reopen_rate.toFixed(1)}%` : '—',
                  icon: <AlertCircle className="h-4 w-4" />,
                  colorClass: (quality.reopen_rate ?? 0) > 5
                    ? 'bg-status-escalated/10 text-status-escalated'
                    : 'bg-muted text-muted-foreground',
                  trend: quality.delta.reopen_rate != null ? -(quality.delta.reopen_rate) : undefined,
                  description: 'lower is better',
                },
              ]}
              loading={qualityLoading}
              columns={2}
            />
          </CardContent>
        </Card>
      )}

      {/* ── SECTION CONTEXT (sectional scope, read-only) ── */}
      {sectional && (
        <section className="rounded-lg border border-muted bg-muted/20 p-4">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-muted-foreground">Section Context — read only</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your section's aggregate backlog. This is context only — not your personal metrics.
            </p>
          </div>
          <KPICardGrid
            metrics={[
              {
                label: 'Section Backlog',
                value: sectional.open_backlog,
                icon: <TrendingUp className="h-4 w-4" />,
                colorClass: 'bg-muted text-muted-foreground',
                description: 'total open tickets in section',
              },
              {
                label: 'Net Flow',
                value: `${sectional.net_flow >= 0 ? '+' : ''}${sectional.net_flow}`,
                icon: <Activity className="h-4 w-4" />,
                colorClass: sectional.net_flow > 0
                  ? 'bg-status-escalated/10 text-status-escalated'
                  : 'bg-status-resolved/10 text-status-resolved',
                description: 'section net flow this window',
              },
              {
                label: 'Created (Section)',
                value: sectional.created,
                icon: <Clock className="h-4 w-4" />,
                colorClass: 'bg-muted text-muted-foreground',
              },
              {
                label: 'Resolved (Section)',
                value: sectional.resolved,
                icon: <CheckCircle className="h-4 w-4" />,
                colorClass: 'bg-muted text-muted-foreground',
              },
            ]}
            loading={false}
            columns={4}
          />
          {sectional.status_distribution && sectional.status_distribution.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {sectional.status_distribution.map((s) => (
                <Badge key={s.status} variant="outline" className="text-xs">
                  {s.status.replace(/_/g, ' ')}: {s.count}
                </Badge>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Detailed Performance Sections (legacy stat cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Assigned"
          value={individual?.open_backlog ?? 0}
          description="Open tickets assigned to me"
          icon={<TrendingUp className="h-6 w-6 text-status-open" />}
          iconBgColor="bg-status-open/10"
          className="bg-card"
        />
        <MetricCard
          title="Resolved"
          value={individual?.resolved ?? 0}
          description="Successfully closed"
          icon={<CheckCircle className="h-6 w-6 text-status-resolved" />}
          iconBgColor="bg-status-resolved/10"
          className="bg-card"
        />
        <MetricCard
          title="At Risk"
          value={individual?.at_risk ?? 0}
          description="SLA at risk"
          icon={<Clock className="h-6 w-6 text-amber-500" />}
          iconBgColor="bg-amber-50"
          className="bg-card"
        />
        <MetricCard
          title="Breached"
          value={individual?.breached ?? 0}
          description="SLA breached"
          icon={<AlertCircle className="h-6 w-6 text-status-escalated" />}
          iconBgColor="bg-status-escalated/10"
          className="bg-card"
        />
      </div>

      {/* Download Report Section */}
      <Card className="py-7 px-2">
        <CardHeader className="pb-5">
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-status-open" />
            Download Performance Report
          </CardTitle>
          <CardDescription>
            Get a detailed Excel report with your performance metrics, ticket history, and ratings
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-foreground text-sm mb-2">Report Includes:</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Total tickets assigned and resolved</li>
              <li>• p50 and p90 resolution times (not mean)</li>
              <li>• CSAT and reopen rate</li>
              <li>• SLA compliance rate</li>
              <li>• Performance trends over the selected period</li>
            </ul>
          </div>

          <Button
            onClick={() => setShowDateDialog(true)}
            disabled={isDownloading}
            className="w-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download My Performance Report (Excel)
          </Button>
        </CardContent>
      </Card>

      {/* Date Range Dialog */}
      <Dialog open={showDateDialog} onOpenChange={setShowDateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download Performance Report</DialogTitle>
            <DialogDescription>
              Select a date range or leave empty for all time data
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4" />
              <span className="font-medium">Date Range (Optional)</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tech-start-date" className="text-sm">
                  Start Date
                </Label>
                <Input
                  id="tech-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isDownloading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tech-end-date" className="text-sm">
                  End Date
                </Label>
                <Input
                  id="tech-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isDownloading}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Leave dates empty to include all your tickets from all time
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowDateDialog(false);
                setStartDate('');
                setEndDate('');
              }}
              disabled={isDownloading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDownloadReport}
              disabled={isDownloading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isDownloading ? (
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
        </DialogContent>
      </Dialog>

      {/* Info Card */}
      <Card className="py-7 px-2 bg-muted/30 border-gray-200">
        <CardContent className="p-5">
          <div className="flex gap-3">
            <FileSpreadsheet className="h-5 w-5 text-gray-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">About Your Reports</h4>
              <p className="text-sm text-gray-600">
                {technicianId
                  ? "Your performance reports are generated for the selected date window and include all tickets assigned to you. Resolution times are shown as p50 (median) and p90 (90th percentile) — never as a single mean."
                  : "Download the technician performance report to view detailed metrics for all technicians. This report includes resolution times, ticket counts, and satisfaction ratings."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TechReport;
