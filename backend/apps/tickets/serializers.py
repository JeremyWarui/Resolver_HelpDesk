"""
What a ticket looks like coming out, and what a client is allowed to put in.

The write shapes are narrow: a client supplies the service, the location and a
description, while campus, trade and priority are derived here.
"""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import TechnicianTrade
from apps.org.models import ServiceItem
from apps.tickets.phone import (
    CONTACT_PHONE_HELP,
    InvalidPhoneNumber,
    normalise_phone,
)
from apps.sla.models import Priority
from apps.facilities.models import Facility
from apps.tickets.models import (
    Ticket,
    TicketAttachment,
    TicketComment,
    TicketLog,
)
from apps.tickets.constants import ALL_STATUSES, PENDING_REASON_CODES
from apps.tickets.sla import is_overdue, sla_outcome
from apps.accounts.serializers import UserMinSerializer

User = get_user_model()


class _PriorityMinSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    rank = serializers.IntegerField()


class _TradeMinSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    code = serializers.CharField()


class _ServiceItemMinSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class _CampusMinSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    name = serializers.CharField()


class _FacilityTypeMinSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    code = serializers.CharField()


class _FacilityMinSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class _TicketLocationSerializer(serializers.Serializer):
    """The ticket's location columns, nested for the client (`source="*"`)."""

    facility_type = _FacilityTypeMinSerializer(
        source="facility.facility_type", read_only=True
    )
    facility = _FacilityMinSerializer(read_only=True)
    detail = serializers.CharField(source="location_detail", read_only=True)


class TicketReadSerializer(serializers.ModelSerializer):
    """A ticket as a list row: what a table cell renders, and nothing else.

    Every field here earns a column. The SLA machinery behind "late" and the
    full location are what a reader opens the ticket for, so they sit on the
    detail shape.
    """

    service_item = _ServiceItemMinSerializer(read_only=True)
    trade = _TradeMinSerializer(read_only=True)
    priority = _PriorityMinSerializer(read_only=True)
    assigned_to = UserMinSerializer(read_only=True, allow_null=True)
    raised_by = UserMinSerializer(read_only=True)
    requester_campus = _CampusMinSerializer(read_only=True)
    facility = serializers.CharField(source="facility.name", read_only=True)
    is_breaching = serializers.SerializerMethodField()
    has_feedback = serializers.SerializerMethodField()
    # The label, not the code: a cell renders words, and filtering is server-side.
    pending_reason_display = serializers.CharField(
        source="get_pending_reason_display", read_only=True
    )

    class Meta:
        model = Ticket
        fields = [
            "id",
            "ticket_no",
            "raised_by",
            "requester_campus",
            "service_item",
            "trade",
            "priority",
            "assigned_to",
            "facility",
            "description",
            "status",
            # An HOS's job includes seeing what escalated.
            "current_level",
            # When the clock last started: raised, or reopened. The SLA bar measures from here.
            "clock_started_at",
            "resolution_due_at",
            # When the current hold began: the held lists say how long.
            "paused_at",
            "pending_reason_display",
            "is_breaching",
            "has_feedback",
            "created_at",
            "updated_at",
            "resolved_at",
        ]
        read_only_fields = fields

    def get_is_breaching(self, ticket):
        """The badge. `tickets.sla` decides what late means; see its docstring."""
        return is_overdue(ticket)

    def get_has_feedback(self, ticket):
        """Whether the requester has rated this yet — a flag, not the rating."""
        return ticket.rated_at is not None


class TicketDetailReadSerializer(TicketReadSerializer):
    """One ticket, in full: the list row plus everything a reader opened it for.

    `contact_phone` is here and not on the list: nobody needs every requester's
    number in one paginated response.
    """

    feedback = serializers.SerializerMethodField()
    location = _TicketLocationSerializer(source="*", read_only=True)
    # "met" | "missed" | "overdue" | null, from `tickets/sla.py`, so the
    # detail never judges a deadline itself.
    sla_outcome = serializers.SerializerMethodField()

    class Meta(TicketReadSerializer.Meta):
        fields = TicketReadSerializer.Meta.fields + [
            "feedback",
            "sla_outcome",
            "contact_phone",
            "location",
            "pending_reason",
            "pending_reason_note",
        ]
        read_only_fields = fields

    def get_sla_outcome(self, ticket):
        return sla_outcome(ticket)

    def get_feedback(self, ticket):
        """The submitted rating, or None when the requester has not rated it."""
        if ticket.rated_at is None:
            return None
        return {
            "rating": ticket.rating,
            "comment": ticket.rating_comment,
            "created_at": ticket.rated_at,
        }


class LocationInputSerializer(serializers.Serializer):
    """Where the job is: a facility at the requester's campus, and the spot in it."""

    facility = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.select_related("facility_type", "campus")
    )
    detail = serializers.CharField(max_length=200, trim_whitespace=True)


class TicketCreateSerializer(serializers.Serializer):
    """Raising a ticket. Anyone may; the routing is not theirs to choose.

    The requester picks a service, a place and a description. Campus, trade,
    priority and both SLA due dates are derived, so two people raising the
    same fault cannot land in different queues.
    """

    # The catalogue hides retired rows; the pk is client-supplied, so re-check.
    service_item = serializers.PrimaryKeyRelatedField(
        queryset=ServiceItem.objects.filter(
            is_active=True, trade__is_active=True
        ).select_related("trade")
    )
    location = LocationInputSerializer()
    description = serializers.CharField(required=False, allow_blank=True, default="")
    contact_phone = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=32,
        help_text=CONTACT_PHONE_HELP,
    )

    def validate_contact_phone(self, value):
        """Normalise to E.164, rejecting anything that is not a Kenyan number."""
        try:
            return normalise_phone(value)
        except InvalidPhoneNumber as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate(self, attrs):
        """The ticket is raised at the requester's home campus, so the facility must be on it."""
        # Their *home* campus: a client-supplied one would be client-supplied routing.
        campus_id = self.context["request"].user.campus_id
        if campus_id is None:
            raise serializers.ValidationError("User has no campus assigned.")
        if attrs["location"]["facility"].campus_id != campus_id:
            raise serializers.ValidationError(
                {"location": "The facility is not on the requester's campus."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        """Write the ticket and its `created` log row, together.

        Campus, trade and priority are derived: the requester's home campus,
        the service item's trade, and the lowest priority until the HOS sets one.
        """
        request = self.context["request"]
        priority = Priority.default()
        location = validated_data["location"]

        # The clock starts at creation: time spent unassigned is what the SLA measures.
        now = timezone.now()
        response_due_at, resolution_due_at = priority.due_dates(now)

        ticket = Ticket.objects.create(
            raised_by=request.user,
            requester_campus_id=request.user.campus_id,
            service_item=validated_data["service_item"],
            trade=validated_data["service_item"].trade,
            priority=priority,
            facility=location["facility"],
            location_detail=location["detail"],
            description=validated_data.get("description", ""),
            contact_phone=validated_data["contact_phone"],
            clock_started_at=now,
            response_due_at=response_due_at,
            resolution_due_at=resolution_due_at,
        )

        TicketLog.objects.create(
            ticket=ticket,
            event_type="created",
            actor=request.user,
            to_value=ticket.ticket_no,
        )

        return ticket


class TicketStatusUpdateSerializer(serializers.Serializer):
    """A requested status change. Whether it is legal is `lifecycle`'s call, not this one."""

    status = serializers.ChoiceField(choices=list(ALL_STATUSES))
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    pending_reason = serializers.ChoiceField(
        choices=list(PENDING_REASON_CODES),
        required=False,
        allow_blank=True,
        default="",
    )
    pending_reason_note = serializers.CharField(
        required=False, allow_blank=True, default=""
    )


class TicketAssignSerializer(serializers.Serializer):
    """Assignment is where priority is decided.

    A ticket opens at the default (lowest) priority and the HOS sets the real one
    as they hand it out. Omitting it leaves whatever the ticket already carries.
    """

    assigned_to = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    priority = serializers.PrimaryKeyRelatedField(
        queryset=Priority.objects.all(), required=False
    )
    # Lands on the `assigned` log row's `reason`, not on the Ticket.
    note = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)

    def validate(self, attrs):
        """Refuse an assignee who does not work this ticket's (campus, trade) pair."""
        ticket = self.context["ticket"]
        if not TechnicianTrade.objects.filter(
            campus=ticket.requester_campus,
            trade=ticket.trade,
            user=attrs["assigned_to"],
            user__is_active=True,
        ).exists():
            raise serializers.ValidationError(
                {
                    "assigned_to": "User is not a technician for this ticket's "
                    "campus and trade."
                }
            )
        return attrs


class TicketCommentSerializer(serializers.ModelSerializer):
    """A comment on a ticket. Who may read or post is the view's decision."""

    author = UserMinSerializer(read_only=True)
    body = serializers.CharField(max_length=5000, trim_whitespace=True)

    class Meta:
        model = TicketComment
        fields = ["id", "author", "body", "created_at"]
        read_only_fields = ["id", "author", "created_at"]


class TicketFeedbackSerializer(serializers.Serializer):
    """A rating, as the requester submits it.

    Not a ModelSerializer: rating and comment are two columns on the Ticket,
    and the caller decides when they may be written.
    """

    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class TicketFeedbackRowSerializer(serializers.ModelSerializer):
    """A rated ticket as the Feedback tab lists it.

    Flattened, carrying just enough to say what was rated and who did the work
    — the tab is a list of ratings, not of tickets.
    """

    service_item = serializers.CharField(source="service_item.name", read_only=True)
    campus = serializers.CharField(source="requester_campus.name", read_only=True)
    trade = serializers.CharField(source="trade.name", read_only=True)
    assigned_to = UserMinSerializer(read_only=True, allow_null=True)
    comment = serializers.CharField(source="rating_comment", read_only=True)
    created_at = serializers.DateTimeField(source="rated_at", read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id",
            "ticket_no",
            "service_item",
            "campus",
            "trade",
            "assigned_to",
            "resolved_at",
            "rating",
            "comment",
            "created_at",
        ]
        read_only_fields = fields


class TicketAttachmentSerializer(serializers.ModelSerializer):
    """An attachment, with an absolute URL and the size of the stored file."""

    uploaded_by = UserMinSerializer(read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = TicketAttachment
        fields = [
            "id",
            "original_name",
            "mime_type",
            "stored_size",
            "url",
            "uploaded_by",
            "created_at",
        ]
        read_only_fields = fields

    def get_url(self, obj):
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class TicketLogSerializer(serializers.ModelSerializer):
    """One row of a ticket's timeline, as the detail page renders it."""

    actor = UserMinSerializer(read_only=True, allow_null=True)
    level_user = UserMinSerializer(read_only=True, allow_null=True)

    class Meta:
        model = TicketLog
        fields = [
            "id",
            "event_type",
            "from_value",
            "to_value",
            "reason",
            "actor",
            "level_user",
            "created_at",
        ]
        read_only_fields = fields

    def to_representation(self, log):
        data = super().to_representation(log)
        if self.context.get("hide_handover") and log.event_type in ("assigned", "reassigned"):
            data["reason"] = ""
        return data
