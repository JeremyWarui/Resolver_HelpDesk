"""
What a ticket is, as rows.

The Ticket row carries intrinsic current state only — what happened to it is a
TicketLog row. No status is ever changed here; that is `tickets.lifecycle`'s.
A ticket's location and its rating are columns rather than side tables: both
are exactly one per ticket, so a second table could only ever be a join.
"""

import os
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.utils import timezone

from apps.tickets.constants import LEVELS, PENDING_REASONS, STATUSES


class Ticket(models.Model):
    """A service request Model

    No history and no derived figures on this row. Every change of state goes
    through `tickets.lifecycle`, never a direct write from a view.
    """

    # Null only between the insert and the update that follows it: the number
    # is built from the pk, and an empty string would collide on the unique
    # index the moment two tickets were raised at once.
    ticket_no = models.CharField(max_length=24, unique=True, null=True, blank=True)
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="raised_tickets",
    )
    requester_campus = models.ForeignKey(
        "org.Campus",
        on_delete=models.PROTECT,
        related_name="+",
    )
    service_item = models.ForeignKey(
        "org.ServiceItem",
        on_delete=models.PROTECT,
        related_name="tickets",
    )
    # Denormalised from service_item.trade: technician scope matches on the
    # (campus, trade) pair, so a null here empties their queryset.
    trade = models.ForeignKey(
        "org.Trade",
        on_delete=models.PROTECT,
        related_name="tickets",
    )
    priority = models.ForeignKey(
        "sla.Priority",
        on_delete=models.PROTECT,
        related_name="tickets",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_tickets",
    )

    # Where the job is: a registered facility at the requester's campus, and
    # the room, floor or spot inside it in the requester's own words.
    facility = models.ForeignKey(
        "facilities.Facility",
        on_delete=models.PROTECT,
        related_name="tickets",
    )
    location_detail = models.CharField(max_length=200, blank=True)

    description = models.TextField(blank=True)
    contact_phone = models.CharField(
        max_length=32,
        blank=True,
        help_text="Optional — just in case the technician needs to call.",
    )
    status = models.CharField(max_length=16, choices=STATUSES, default="open")
    current_level = models.CharField(
        max_length=12, choices=LEVELS, default="technician"
    )
    # When the SLA clock last started: at raising, and again on reopen.
    # Escalation and a priority change both measure from here.
    clock_started_at = models.DateTimeField(default=timezone.now)
    response_due_at = models.DateTimeField(null=True, blank=True)
    resolution_due_at = models.DateTimeField(null=True, blank=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    accumulated_pause = models.DurationField(default=timedelta)
    pending_reason = models.CharField(
        max_length=32,
        choices=PENDING_REASONS,
        blank=True,
        default="",
        help_text="Set while status is 'pending'; cleared when work resumes.",
    )
    pending_reason_note = models.TextField(
        blank=True,
        help_text="Optional free text alongside the code.",
    )

    # The requester's verdict on the finished job, submitted once the ticket is
    # settled. `rated_at` is the flag: a rating is never removed or revised.
    rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    rating_comment = models.TextField(blank=True)
    rated_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "tickets"
        ordering = ["-updated_at"]
        constraints = [
            # The validators above only run under full_clean(), which nothing
            # calls here. This is the guard that actually holds.
            models.CheckConstraint(
                condition=models.Q(rating__isnull=True)
                | models.Q(rating__gte=1, rating__lte=5),
                name="ticket_rating_between_1_and_5",
            )
        ]
        indexes = [
            # The supervisor list, and the campus filter under it.
            models.Index(
                fields=["requester_campus", "status", "-updated_at"],
                name="ticket_campus_status_idx",
            ),
            # A technician's own queue.
            models.Index(
                fields=["assigned_to", "status"],
                name="ticket_assignment_idx",
            ),
            # ?mine=1, and the requester's dashboard.
            models.Index(
                fields=["raised_by", "-updated_at"],
                name="ticket_raised_by_idx",
            ),
            # The technician scope pair, correlated against TechnicianTrade.
            models.Index(
                fields=["requester_campus", "trade"],
                name="ticket_campus_trade_idx",
            ),
            # q_overdue, and the SLA sweep behind it.
            models.Index(
                fields=["status", "resolution_due_at"],
                name="ticket_resolution_due_idx",
            ),
        ]

    def save(self, *args, **kwargs):
        """Allocate the ticket number on the first save."""
        if self.ticket_no:
            return super().save(*args, **kwargs)
        # Two writes: the number contains the pk, which only the insert knows.
        with transaction.atomic():
            super().save(*args, **kwargs)
            self.ticket_no = f"TKT-{self.requester_campus.code.upper()}-{self.pk:05d}"
            super().save(update_fields=["ticket_no"])

    def __str__(self):
        return f"{self.ticket_no} ({self.status})"


class TicketLog(models.Model):
    """The ticket's history. Append-only, and never edited or deleted.

    Everything the Ticket row does not keep lives here: who acted, what
    changed, and why. Snapshots the acting user, and for an escalation the
    person the ticket climbed to.
    """

    EVENT_TYPES = [
        ("created", "Created"),
        ("assigned", "Assigned"),
        ("reassigned", "Reassigned"),
        ("status_changed", "Status Changed"),
        ("escalated", "Escalated"),
        ("priority_changed", "Priority Changed"),
        ("comment_added", "Comment Added"),
        ("resolved", "Resolved"),
        ("closed", "Closed"),
        ("reopened", "Reopened"),
        ("rated", "Rated"),
    ]

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="logs",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ticket_log_actions",
    )
    event_type = models.CharField(max_length=20, choices=EVENT_TYPES)
    from_value = models.CharField(max_length=100, blank=True)
    to_value = models.CharField(max_length=100, blank=True)
    reason = models.TextField(blank=True)
    level_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "tickets"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["ticket", "-created_at"],
                name="ticketlog_ticket_created_idx",
            )
        ]

    def save(self, *args, **kwargs):
        """Allow the insert, refuse the update."""
        if self.pk:
            raise ValueError("TicketLog records are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Never. A deleted audit row is indistinguishable from one that never happened."""
        raise ValueError("TicketLog records cannot be deleted.")

    def __str__(self):
        return f"{self.event_type} on {self.ticket_id} at {self.created_at}"


class TicketComment(models.Model):
    """A comment on a ticket: the staff working log, not a conversation.

    The requester neither writes nor reads these, which is why there is no
    visibility flag — every row is staff-facing. Who may post is decided in
    `tickets.views.TicketCommentListCreateView`.
    """

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="ticket_comments",
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "tickets"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Comment by {self.author_id} on {self.ticket_id}"


def _attachment_upload_to(instance, filename):
    """Return the storage path: a random name under the ticket's own folder."""
    # A user-supplied name is a path-traversal surface; `original_name` keeps it.
    ext = os.path.splitext(filename)[1].lower()
    return f"tickets/{instance.ticket_id}/attachments/{uuid.uuid4().hex}{ext}"


class TicketAttachment(models.Model):
    """A file attached to a ticket, stored after `tickets.attachments` has shrunk it."""

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to=_attachment_upload_to)
    original_name = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=128)
    stored_size = models.PositiveIntegerField()
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ticket_attachments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "tickets"
        ordering = ["created_at"]

    def __str__(self):
        return f"Attachment '{self.original_name}' on ticket {self.ticket_id}"
