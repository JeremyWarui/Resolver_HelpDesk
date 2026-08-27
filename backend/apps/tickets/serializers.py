"""
What a ticket looks like coming out, and what a client is allowed to put in.

The write shapes are narrow: a client supplies the service, the location and a
description, while campus, trade and priority are derived here.
"""

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import TechnicianTrade
from apps.org.models import ServiceItem
from apps.common.phone import (
    CONTACT_PHONE_HELP,
    InvalidPhoneNumber,
    normalise_phone,
)
from apps.sla.models import Priority
from apps.sla.clock import compute_due_dates, is_overdue
from apps.facilities.models import Facility, FacilityType
from apps.facilities.validators import validate_location
from apps.tickets.models import (
    Ticket,
    TicketAttachment,
    TicketComment,
    TicketFeedback,
    TicketLocation,
    TicketLog,
)
from apps.tickets.constants import ALL_STATUSES, PENDING_REASON_CODES
from apps.accounts.identity import display_name
from apps.accounts.serializers import UserMinSerializer

User = get_user_model()


class _PriorityMinSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    rank = serializers.IntegerField()


class _SubSectionMinSerializer(serializers.Serializer):
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
    # Read through the facility: the ticket no longer stores the type twice.
    facility_type = _FacilityTypeMinSerializer(
        source="facility.facility_type", read_only=True
    )
    facility = _FacilityMinSerializer(read_only=True)
    values = serializers.JSONField()


class TicketReadSerializer(serializers.ModelSerializer):
    """A ticket as a list row: everything the table shows, nothing it does not.

    The base for the detail shape too, so a field added here appears in both.
    """

    service_item = _ServiceItemMinSerializer(read_only=True)
    sub_section = _SubSectionMinSerializer(read_only=True)
    priority = _PriorityMinSerializer(read_only=True)
    assigned_to = UserMinSerializer(read_only=True, allow_null=True)
    raised_by = UserMinSerializer(read_only=True)
    raised_by_id = serializers.IntegerField(read_only=True)
    requester_campus = _CampusMinSerializer(read_only=True)
    location = _TicketLocationSerializer(read_only=True, allow_null=True)
    is_breaching = serializers.SerializerMethodField()
    has_feedback = serializers.SerializerMethodField()
    pending_reason_display = serializers.CharField(
        source="get_pending_reason_display", read_only=True
    )

    class Meta:
        model = Ticket
        fields = [
            "id",
            "ticket_no",
            "raised_by",
            "raised_by_id",
            "requester_campus",
            "service_item",
            "sub_section",
            "priority",
            "assigned_to",
            "description",
            "status",
            "current_level",
            "response_due_at",
            "resolution_due_at",
            "paused_at",
            "accumulated_pause",
            "pending_reason",
            "pending_reason_display",
            "pending_reason_note",
            "is_breaching",
            "has_feedback",
            "created_at",
            "updated_at",
            "resolved_at",
            "closed_at",
            "location",
        ]
        read_only_fields = fields

    def get_is_breaching(self, ticket):
        """The badge. `sla.clock` decides what late means; see its docstring."""
        return is_overdue(ticket)

    def get_has_feedback(self, ticket):
        """Whether the requester has rated this yet — a flag, not the rating.

        Reads the `has_feedback` annotation the queryset supplies; the
        attribute fallback is for the odd unannotated instance.
        """
        annotated = getattr(ticket, "has_feedback", None)
        if annotated is not None:
            return bool(annotated)
        return TicketFeedback.objects.filter(ticket=ticket).exists()


class TicketDetailReadSerializer(TicketReadSerializer):
    """Detail-only extension: submitted feedback and the requester's contact number.

    `contact_phone` is deliberately absent from the list serializer. A
    technician opening one ticket needs a number to call; nobody needs every
    requester's number in a single paginated response.
    """

    feedback = serializers.SerializerMethodField()

    class Meta(TicketReadSerializer.Meta):
        fields = TicketReadSerializer.Meta.fields + ["feedback", "contact_phone"]
        read_only_fields = fields

    def get_feedback(self, ticket):
        """The submitted rating, or None when the requester has not rated it."""
        try:
            feedback = ticket.feedback
        except TicketFeedback.DoesNotExist:
            return None
        return TicketFeedbackSerializer(feedback).data


class LocationInputSerializer(serializers.Serializer):
    """The location half of a create request, before it is checked.

    Only the shape is validated here. Whether these values make sense for this
    facility type is `facilities.validators.validate_location`'s decision, and
    `TYPE_SPECS` there is the contract.

    The facility is required and is the only id needed: every location is a
    registered facility at the requester's campus, and it names its own type.
    """

    facility = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.select_related("facility_type", "campus")
    )
    values = serializers.DictField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=dict,
    )


class TicketCreateSerializer(serializers.Serializer):
    """Raising a ticket. Anyone may; the routing is not theirs to choose.

    The requester picks a service, a place and a description. Campus, trade,
    priority and both SLA due dates are derived, so two people raising the
    same fault cannot land in different queues.
    """

    service_item = serializers.PrimaryKeyRelatedField(
        queryset=ServiceItem.objects.select_related("sub_section")
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
        """Derive everything the requester did not supply: campus, trade, priority."""
        request = self.context["request"]
        user = request.user

        # Their *home* campus: a client-supplied one would be client-supplied routing.
        try:
            campus = user.campus
        except Exception:
            campus = None
        if campus is None:
            raise serializers.ValidationError("User has no campus assigned.")

        service_item = attrs["service_item"]

        contact_phone = attrs.get("contact_phone")
        if not contact_phone:
            # An unusable profile number must not block raising a ticket.
            try:
                contact_phone = normalise_phone(getattr(user, "phone_number", ""))
            except InvalidPhoneNumber:
                contact_phone = ""
        attrs["contact_phone"] = contact_phone

        priority = Priority.default()

        location_input = attrs["location"]
        location_data = validate_location(
            location_input["facility"],
            location_input.get("values", {}),
            campus.id,
        )

        # Underscored so DRF leaves them alone; create() pops each one.
        attrs["_sub_section"] = service_item.sub_section
        attrs["_priority"] = priority
        attrs["_requester_campus"] = campus
        attrs["_location_data"] = location_data

        return attrs

    def create(self, validated_data):
        """Write the ticket, its location and its `created` log row."""
        request = self.context["request"]

        sub_section = validated_data.pop("_sub_section")
        priority = validated_data.pop("_priority")
        requester_campus = validated_data.pop("_requester_campus")
        location_data = validated_data.pop("_location_data")

        validated_data.pop("location", None)

        # The clock starts at creation: time spent unassigned is what the SLA measures.
        now = timezone.now()
        response_due_at, resolution_due_at = compute_due_dates(priority, now)

        ticket = Ticket.objects.create(
            raised_by=request.user,
            requester_campus=requester_campus,
            service_item=validated_data["service_item"],
            sub_section=sub_section,
            priority=priority,
            description=validated_data.get("description", ""),
            contact_phone=validated_data["contact_phone"],
            response_due_at=response_due_at,
            resolution_due_at=resolution_due_at,
        )

        TicketLocation.objects.create(
            ticket=ticket,
            facility=location_data["facility"],
            values=location_data["values"],
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
            sub_section=ticket.sub_section,
            user=attrs["assigned_to"],
        ).exists():
            raise serializers.ValidationError(
                {
                    "assigned_to": "User is not a technician for this ticket's "
                    "campus and trade."
                }
            )
        return attrs


class TicketCommentSerializer(serializers.ModelSerializer):
    """A comment on a ticket. Staff-facing throughout: the requester never
    reaches this endpoint, so there is nothing to mark as internal."""

    author = UserMinSerializer(read_only=True)

    class Meta:
        model = TicketComment
        fields = ["id", "author", "body", "created_at", "updated_at"]
        read_only_fields = ["id", "author", "created_at", "updated_at"]


class TicketFeedbackSerializer(serializers.ModelSerializer):
    """A rating, as the requester submits it and as the detail view returns it."""

    class Meta:
        model = TicketFeedback
        fields = ["id", "rating", "comment", "created_at"]
        read_only_fields = ["id", "created_at"]


class TicketFeedbackRowSerializer(serializers.ModelSerializer):
    """A rating as the Feedback tab lists it.

    Flattened, carrying just enough of the ticket to say what was rated and
    who did the work — the tab is a list of ratings, not of tickets.
    """

    ticket_no = serializers.CharField(source="ticket.ticket_no", read_only=True)
    service_item = serializers.SerializerMethodField()
    campus = serializers.CharField(
        source="ticket.requester_campus.name", read_only=True
    )
    trade = serializers.CharField(source="ticket.sub_section.name", read_only=True)
    assigned_to = UserMinSerializer(
        source="ticket.assigned_to", read_only=True, allow_null=True
    )
    resolved_at = serializers.DateTimeField(source="ticket.resolved_at", read_only=True)

    class Meta:
        model = TicketFeedback
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

    def get_service_item(self, obj):
        item = obj.ticket.service_item
        return item.name if item else ""

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


class AuditLogRowSerializer(serializers.ModelSerializer):
    """A TicketLog row as the admin audit table lists it.

    Wider than the per-ticket timeline in one respect only — the ticket number,
    because the admin is reading across every ticket.
    """

    actor = serializers.SerializerMethodField()
    actor_username = serializers.CharField(
        source="actor.username", read_only=True, allow_null=True
    )
    action = serializers.CharField(source="event_type", read_only=True)
    ticket_no = serializers.CharField(source="ticket.ticket_no", read_only=True)
    detail = serializers.SerializerMethodField()

    class Meta:
        model = TicketLog
        fields = [
            "id",
            "actor",
            "actor_username",
            "action",
            "ticket_no",
            "detail",
            "reason",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor(self, obj):
        """The person, by name — an audit log is read by humans looking for who.

        The username travels beside it: two people can share a name, and it is the
        stable handle.
        """
        return display_name(obj.actor) or None

    def get_detail(self, obj):
        parts = []
        if obj.from_value:
            parts.append(f"from: {obj.from_value}")
        if obj.to_value:
            parts.append(f"to: {obj.to_value}")
        return " | ".join(parts)
