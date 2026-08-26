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
    # Unified endpoint: one view, full envelope, every role. Anything wanting
    # an SLA percentage, a percentile, a flow trend or a CSAT reads `headline`
    # or `series` off this envelope. Do not add a per-slice endpoint beside it;
    # each one re-runs the whole ~40-query aggregate() for a few scalars.
    #
    # A technician is answered with `individual`/`sectional` instead of
    # `headline`. MyPerformancePanel reads `individual`, which is their own
    # numbers rather than the sectional pool. ServiceHealthCards reads
    # `headline` and is never rendered for them.
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
