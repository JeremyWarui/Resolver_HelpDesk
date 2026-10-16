"""What people say about the system itself, as opposed to a rating of a fix."""

from django.conf import settings
from django.db import models


class SystemFeedback(models.Model):
    CATEGORIES = [
        ("problem", "Problem"),
        ("idea", "Idea"),
        ("praise", "Praise"),
        ("other", "Other"),
    ]
    MESSAGE_MAX = 2000

    # Kept when the account is deleted: what they said still stands.
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    # The role when it was sent, which a later role change must not rewrite.
    author_role = models.CharField(max_length=16)
    category = models.CharField(max_length=16, choices=CATEGORIES)
    message = models.TextField(max_length=MESSAGE_MAX)
    page = models.CharField(max_length=200, blank=True)
    reviewed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["reviewed"])]

    def __str__(self):
        return f"SystemFeedback({self.category}, reviewed={self.reviewed})"
