"""Notification routes, included by resolver/api_urls.py under /api/v1/."""

from django.urls import path

from apps.notifications.views import (
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
)

urlpatterns = [
    path("notifications/", NotificationListView.as_view(), name="notifications-list"),
    path(
        "notifications/<int:pk>/read/",
        NotificationMarkReadView.as_view(),
        name="notification-mark-read",
    ),
    path(
        "notifications/read-all/",
        NotificationMarkAllReadView.as_view(),
        name="notifications-read-all",
    ),
]
