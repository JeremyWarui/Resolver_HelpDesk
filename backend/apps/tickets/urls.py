"""
Ticket routes, included by resolver/api_urls.py under /api/v1/.

Every `/tickets/<pk>/` route re-checks scope through
`views.get_ticket_for_request_or_403`. Adding one is adding an IDOR surface.
"""

from django.urls import path

from apps.tickets.views import (
    EscalationPreviewView,
    EscalationRunView,
    EscalationStatusView,
    TicketAssignView,
    TicketAttachmentView,
    TicketClaimView,
    TicketCommentListCreateView,
    TicketDetailView,
    TicketFeedbackListView,
    TicketFeedbackSummaryView,
    TicketFeedbackView,
    TicketFilterOptionsView,
    TicketListCreateView,
    TicketLogListView,
    TicketStatusView,
)

urlpatterns = [
    path("escalations/", EscalationStatusView.as_view(), name="escalation-status"),
    path("escalations/preview/", EscalationPreviewView.as_view(), name="escalation-preview"),
    path("escalations/run/", EscalationRunView.as_view(), name="escalation-run"),
    path("tickets/", TicketListCreateView.as_view(), name="ticket-list"),
    path(
        "tickets/filter-options/",
        TicketFilterOptionsView.as_view(),
        name="ticket-filter-options",
    ),
    path(
        "tickets/feedback/",
        TicketFeedbackListView.as_view(),
        name="ticket-feedback-list",
    ),
    path(
        "tickets/feedback/summary/",
        TicketFeedbackSummaryView.as_view(),
        name="ticket-feedback-summary",
    ),
    path("tickets/<int:pk>/", TicketDetailView.as_view(), name="ticket-detail"),
    path("tickets/<int:pk>/status/", TicketStatusView.as_view(), name="ticket-status"),
    path("tickets/<int:pk>/assign/", TicketAssignView.as_view(), name="ticket-assign"),
    path("tickets/<int:pk>/claim/", TicketClaimView.as_view(), name="ticket-claim"),
    path(
        "tickets/<int:pk>/comments/",
        TicketCommentListCreateView.as_view(),
        name="ticket-comments",
    ),
    path(
        "tickets/<int:pk>/feedback/",
        TicketFeedbackView.as_view(),
        name="ticket-feedback",
    ),
    path("tickets/<int:pk>/logs/", TicketLogListView.as_view(), name="ticket-logs"),
    path(
        "tickets/<int:pk>/attachments/",
        TicketAttachmentView.as_view(),
        name="ticket-attachments",
    ),
]
