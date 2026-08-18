from django.urls import path

from . import views
from . import report_views

app_name = "analytics"

urlpatterns = [
    path("reports/types/", report_views.ReportTypesView.as_view(), name="report-types"),
    path(
        "reports/generate/",
        report_views.GenerateReportView.as_view(),
        name="report-generate",
    ),
    # Unified endpoint — one view, full envelope, every role.
    #
    # The four slice endpoints below (sla-compliance, resolution-times, flow,
    # quality) each re-run the whole ~40-query aggregate() to return a handful
    # of scalars that `/analytics/` already carries in `headline` and `series`.
    # RoleAnalyticsView used to call all four *and* `/analytics/` for one page
    # render — five aggregates over the same scope and window. It now reads the
    # envelope alone.
    #
    # They are not removable yet. ServiceHealthCards (sla + quality) and
    # MyPerformancePanel (resolution-times) are also reachable from
    # `RoleReportsPage role="technician"`, and the technician branch of
    # AnalyticsView deliberately returns `individual`/`sectional` instead of
    # `headline` — so pointing those two at the envelope is a decision about
    # *which* scope a technician's cards should show (today the slice endpoints
    # give them the sectional pool), not a mechanical swap. Make that call
    # before deleting these.
    path("analytics/", views.AnalyticsView.as_view(), name="analytics"),
    path("analytics/overview/", views.OverviewView.as_view(), name="overview"),
    path(
        "analytics/sla-compliance/",
        views.SLAComplianceView.as_view(),
        name="sla-compliance",
    ),
    path(
        "analytics/resolution-times/",
        views.ResolutionTimesView.as_view(),
        name="resolution-times",
    ),
    path("analytics/flow/", views.FlowView.as_view(), name="flow"),
    path("analytics/quality/", views.QualityView.as_view(), name="quality"),
    path("analytics/demand/", views.DemandView.as_view(), name="demand"),
    path(
        "analytics/performance/technicians/",
        views.PerformanceTechniciansView.as_view(),
        name="performance-technicians",
    ),
    path(
        "analytics/performance/sections/",
        views.PerformanceSectionsView.as_view(),
        name="performance-sections",
    ),
    path(
        "analytics/performance/facilities/",
        views.PerformanceFacilitiesView.as_view(),
        name="performance-facilities",
    ),
    path(
        "analytics/performance/trade-mix/",
        views.PerformanceTradeMixView.as_view(),
        name="performance-trade-mix",
    ),
    path(
        "analytics/performance/trades/",
        views.PerformanceTradesView.as_view(),
        name="performance-trades",
    ),
    path(
        "analytics/performance/campus-departments/",
        views.PerformanceCampusDepartmentsView.as_view(),
        name="performance-campus-departments",
    ),
]
