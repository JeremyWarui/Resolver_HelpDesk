"""System feedback routes, included by resolver/api_urls.py under /api/v1/."""

from django.urls import path

from apps.system_feedback.views import (
    SystemFeedbackListCreateView,
    SystemFeedbackReviewView,
)

urlpatterns = [
    path(
        "system-feedback/",
        SystemFeedbackListCreateView.as_view(),
        name="system-feedback-list",
    ),
    path(
        "system-feedback/<int:pk>/",
        SystemFeedbackReviewView.as_view(),
        name="system-feedback-review",
    ),
]
