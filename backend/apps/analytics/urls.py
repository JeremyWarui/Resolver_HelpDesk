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
    # Unified endpoint — one view, full envelope, every role. `headline` and
    # `series` carry what four separate slice endpoints (sla-compliance,
    # resolution-times, flow, quality) used to return, each of which re-ran the
    # whole ~40-query aggregate() for a handful of scalars. RoleAnalyticsView
    # called all four *and* this one for a single render.
    #
    # Those four are gone. Anything wanting an SLA percentage, a percentile, a
    # flow trend or a CSAT reads the envelope — adding a fifth slice endpoint
    # is how the five-aggregates-per-page problem comes back.
    #
    # A technician is answered with `individual`/`sectional` instead of
    # `headline` (SoT 5.4). MyPerformancePanel reads `individual`: their own
    # numbers, which is what a panel titled "my performance" must show — it
    # previously took its resolution percentiles from the sectional pool.
    # ServiceHealthCards reads `headline` and is never rendered for them.
    path("analytics/", views.AnalyticsView.as_view(), name="analytics"),
    path("analytics/overview/", views.OverviewView.as_view(), name="overview"),
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
