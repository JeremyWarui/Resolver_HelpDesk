"""One row per thing a user should be told about."""

from django.conf import settings
from django.db import models


class Notification(models.Model):
    EVENT_TYPES = [
        ("ticket_created", "Ticket Created"),
        ("ticket_assigned", "Ticket Assigned"),
        ("ticket_status_changed", "Ticket Status Changed"),
        ("ticket_escalated", "Ticket Escalated"),
        ("ticket_resolved", "Ticket Resolved"),
        ("comment_added", "Comment Added"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    event_type = models.CharField(max_length=32, choices=EVENT_TYPES)
    title = models.CharField(max_length=128)
    body = models.CharField(max_length=256)
    ticket = models.ForeignKey(
        "tickets.Ticket",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    # Who did the thing this is about, and what they wrote, when they wrote
    # something: a handover, a progress note, a hold, a resolution, a comment.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    note = models.TextField(blank=True)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "read"]),
            # The feed: one person's rows, newest first.
            models.Index(fields=["user", "-created_at", "-id"]),
        ]

    def __str__(self):
        return f"Notification({self.user_id}, {self.event_type}, read={self.read})"
