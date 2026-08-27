"""
Reporting routes, included by resolver/api_urls.py under /api/v1/.

`analytics/` returns every figure as JSON; `reports/generate/` returns the same
figures as a workbook.
"""

from django.urls import path

from apps.analytics import views

app_name = "analytics"

urlpatterns = [
    path("analytics/", views.AnalyticsView.as_view(), name="analytics"),
    path(
        "reports/generate/",
        views.GenerateReportView.as_view(),
        name="report-generate",
    ),
]
