"""
Reporting routes, included by resolver/api_urls.py under /api/v1/.

`analytics/` returns every figure the system reports, as JSON. The two export
routes return the same figures as an Excel workbook and a PDF summary.
"""

from django.urls import path

from apps.analytics import views

app_name = "analytics"

urlpatterns = [
    path("analytics/", views.AnalyticsView.as_view(), name="analytics"),
    path("analytics/overview/", views.OverviewView.as_view(), name="overview"),
    path("analytics/dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("analytics/export/xlsx/", views.ExcelExportView.as_view(), name="export-xlsx"),
    path("analytics/export/pdf/", views.PdfExportView.as_view(), name="export-pdf"),
]
