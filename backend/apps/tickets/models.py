"""
What a ticket is, as rows.

The Ticket row carries intrinsic current state only — what happened to it is a
TicketLog row. No status is ever changed here; that is `tickets.lifecycle`'s.
"""

import os
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction

from apps.tickets.constants import PENDING_REASONS


class Ticket(models.Model):
    """A service request. Intrinsic current state only.

    Nothing derived, no history, no child data on this row. Every change of
    state goes through `tickets.lifecycle`, never a direct write from a view.
    """

    STATUS = [
        ("open", "Open"),
        ("assigned", "Assigned"),
        ("in_progress", "In progress"),
        ("pending", "Pending"),
        ("resolved", "Resolved"),
        ("closed", "Closed"),
    ]
    LEVEL = [
        ("technician", "Technician"),
        ("hos", "HOS"),
        ("hod", "HOD"),
    ]

    ticket_no = models.CharField(max_length=24, unique=True)
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
    # Denormalised from service_item.sub_section: technician scope matches on the
    # (campus, sub_section) pair, so a null here empties their queryset.
    sub_section = models.ForeignKey(
        "org.SubSection",
        on_delete=models.PROTECT,
        related_name="tickets",
    )
    priority = models.ForeignKey(
        "sla.Priority",
        on_delete=models.PROTECT,
        related_name="+",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_tickets",
    )
    description = models.TextField(blank=True)
    contact_phone = models.CharField(
        max_length=32,
        blank=True,
        help_text="Optional — just in case the technician needs to call.",
    )
    status = models.CharField(max_length=16, choices=STATUS, default="open")
    current_level = models.CharField(max_length=12, choices=LEVEL, default="technician")
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "tickets"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(
                fields=["status", "requester_campus", "-updated_at"],
                name="ticket_campus_status_idx",
            ),
            models.Index(
                fields=["assigned_to", "status"],
                name="ticket_assignment_idx",
            ),
            models.Index(
                fields=["current_level", "status"],
                name="ticket_level_status_idx",
            ),
            models.Index(
                fields=["raised_by", "-updated_at"],
                name="ticket_raised_by_idx",
            ),
            models.Index(
                fields=["status", "created_at"],
                name="ticket_status_created_idx",
            ),
            models.Index(
                fields=["resolved_at", "status"],
                name="ticket_resolved_status_idx",
            ),
            models.Index(
                fields=["resolution_due_at", "status"],
                name="ticket_resolution_due_idx",
            ),
            models.Index(
                fields=["requester_campus", "created_at"],
                name="ticket_campus_created_idx",
            ),
            models.Index(
                fields=["requester_campus", "sub_section", "-updated_at"],
                name="ticket_campus_sub_idx",
            ),
        ]

    def save(self, *args, **kwargs):
        """Allocate the ticket number on the first save."""
        if not self.ticket_no:
            self.ticket_no = self._generate_ticket_no()
        super().save(*args, **kwargs)

    def _generate_ticket_no(self):
        """Build "TKT-<campus>-<0000>" from the requester's campus."""
        campus = self.requester_campus
        seq = TicketSequence.allocate(campus)
        return f"TKT-{campus.code.upper()}-{seq:04d}"

    def __str__(self):
        return f"{self.ticket_no} ({self.status})"


class TicketSequence(models.Model):
    """The per-campus counter that ticket numbers come from.

    Never parse `ticket_no` to work out the next one: string order puts
    `-0010` below `-0009`, and two simultaneous creates would read the same
    maximum and collide on the unique index.
    """

    campus = models.OneToOneField(
        "org.Campus",
        on_delete=models.CASCADE,
        related_name="ticket_sequence",
    )
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        app_label = "tickets"

    @classmethod
    def allocate(cls, campus):
        """Return the next number for this campus. Never reuses one."""
        with transaction.atomic():
            row, created = cls.objects.select_for_update().get_or_create(campus=campus)
            if created:
                row.last_number = cls._max_existing_number(campus)
            row.last_number += 1
            row.save(update_fields=["last_number"])
            return row.last_number

    @staticmethod
    def _max_existing_number(campus):
        """Return the highest number already issued here, or 0."""
        ticket_nos = Ticket.objects.filter(
            requester_campus=campus
        ).values_list("ticket_no", flat=True)
        numbers = [0]
        for ticket_no in ticket_nos:
            try:
                numbers.append(int(ticket_no.rsplit("-", 1)[-1]))
            except (TypeError, ValueError):
                pass
        return max(numbers)

    def __str__(self):
        return f"Sequence {self.campus_id} at {self.last_number}"


class TicketLocation(models.Model):
    """Where the ticket is. Every ticket has one.

    What counts as a location depends on the facility's type, and the shape
    is checked by `facilities.validators.validate_location` before this is
    written. The type is not stored again here; `facility.facility_type` is it.
    """

    ticket = models.OneToOneField(
        Ticket,
        on_delete=models.CASCADE,
        related_name="location",
    )
    facility = models.ForeignKey(
        "facilities.Facility",
        on_delete=models.PROTECT,
        related_name="+",
    )
    values = models.JSONField(default=dict)

    class Meta:
        app_label = "tickets"

    def __str__(self):
        return f"Location for {self.ticket_id}"


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
        ("sla_breach", "SLA Breach"),
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
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "tickets"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Comment by {self.author_id} on {self.ticket_id}"


class TicketFeedback(models.Model):
    """The requester's rating of the finished job. One per ticket, and only theirs.

    Submitted once the ticket is resolved. `Ticket.has_feedback` is the
    annotation that answers "has this been rated yet" without loading it.
    """

    ticket = models.OneToOneField(
        Ticket,
        on_delete=models.CASCADE,
        related_name="feedback",
    )
    # The constraint below is the real guard: nothing calls `full_clean()` here.
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "tickets"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rating__gte=1, rating__lte=5),
                name="ticket_feedback_rating_between_1_and_5",
            )
        ]

    def __str__(self):
        return f"Feedback {self.rating}/5 for {self.ticket_id}"


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
