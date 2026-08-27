"""
Analytics and report routes, included by resolver/api_urls.py under /api/v1/.

`analytics/` returns every figure in one call; `analytics/breakdown/` returns
one dimension's rows without recomputing them.
"""

from django.urls import path

from apps.analytics import report_views, views

app_name = "analytics"

urlpatterns = [
    path("analytics/", views.AnalyticsView.as_view(), name="analytics"),
    path(
        "analytics/breakdown/",
        views.BreakdownView.as_view(),
        name="analytics-breakdown",
    ),
    path(
        "reports/generate/",
        report_views.GenerateReportView.as_view(),
        name="report-generate",
    ),
]
