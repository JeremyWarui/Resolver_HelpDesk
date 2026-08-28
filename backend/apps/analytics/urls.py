"""
Reporting routes, included by resolver/api_urls.py under /api/v1/.

One route: `analytics/` returns every figure the system reports, as JSON. A
dashboard renders all of it at once, so there is nothing to split it into.
"""

from django.urls import path

from apps.analytics import views

app_name = "analytics"

urlpatterns = [
    path("analytics/", views.AnalyticsView.as_view(), name="analytics"),
]
