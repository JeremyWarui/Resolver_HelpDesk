from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from apps.org.models import SectionTechnician, ServiceItem
from apps.common.phone import (
    CONTACT_PHONE_HELP,
    InvalidPhoneNumber,
    normalise_phone,
)
from apps.sla.models import Priority
from apps.sla.services.due_dates import compute_due_dates
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
from apps.tickets.services.routing import ServiceNotAvailableError, resolve_routing
from apps.tickets.statuses import ALL_STATUSES

User = get_user_model()


# ---------------------------------------------------------------------------
# Read serializers (Phase 6 — role-scoped list + detail)
# ---------------------------------------------------------------------------


class _UserMinSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or obj.username


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
    sub_section = _SubSectionMinSerializer()


class _SectionMinSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    section_type_id = serializers.IntegerField()
    # section_type / campus_department are in select_related on ticket queryset (no N+1)
    section_type_name = serializers.CharField(
        source="section_type.name", read_only=True
    )
    name = serializers.CharField(source="section_type.name", read_only=True)
    campus_code = serializers.CharField(
        source="campus_department.campus.code", read_only=True
    )
    department_code = serializers.CharField(
        source="campus_department.department.code", read_only=True
    )


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
    facility_type = _FacilityTypeMinSerializer(read_only=True)
    facility = _FacilityMinSerializer(read_only=True, allow_null=True)
    values = serializers.JSONField()


class TicketReadSerializer(serializers.ModelSerializer):
    """Role-aware read serializer for list and detail views."""

    service_item = _ServiceItemMinSerializer(read_only=True)
    sub_section = _SubSectionMinSerializer(read_only=True)
    section = _SectionMinSerializer(read_only=True)
    priority = _PriorityMinSerializer(read_only=True)
    assigned_to = _UserMinSerializer(read_only=True, allow_null=True)
    raised_by = _UserMinSerializer(read_only=True)
    raised_by_id = serializers.IntegerField(read_only=True)
    requester_campus = _CampusMinSerializer(read_only=True)
    location = _TicketLocationSerializer(read_only=True, allow_null=True)
    is_breaching = serializers.SerializerMethodField()
    has_feedback = serializers.SerializerMethodField()

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
            "section",
            "priority",
            "assigned_to",
            "description",
            "status",
            "current_level",
            "response_due_at",
            "resolution_due_at",
            "paused_at",
            "accumulated_pause",
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
        """Whether the ticket is past its resolution deadline right now.

        A paused ticket never is (R9): its clock is frozen, so the stored
        deadline drifts into the past while it waits and would otherwise show
        red for a delay the section was told to take.
        """
        if ticket.status in ("resolved", "closed", "pending"):
            return False
        if ticket.resolution_due_at is None:
            return False
        return timezone.now() > ticket.resolution_due_at

    def get_has_feedback(self, ticket):
        """Whether the requester has rated this yet — a flag, not the rating.

        The dashboard needs to find resolved tickets still waiting on their
        requester, which it cannot do from the detail-only `feedback` object.
        Reads the `has_feedback` annotation the queryset supplies; the
        attribute fallback is for the odd unannotated instance (e.g. a
        serializer called on a freshly saved object).
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
        try:
            feedback = ticket.feedback
        except TicketFeedback.DoesNotExist:
            return None
        return TicketFeedbackSerializer(feedback).data


class LocationInputSerializer(serializers.Serializer):
    facility_type = serializers.PrimaryKeyRelatedField(
        queryset=FacilityType.objects.all()
    )
    facility = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.select_related("facility_type", "campus"),
        required=False,
        allow_null=True,
    )
    values = serializers.DictField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=dict,
    )


class TicketCreateSerializer(serializers.Serializer):
    service_item = serializers.PrimaryKeyRelatedField(
        queryset=ServiceItem.objects.select_related("sub_section__section_type")
    )
    location = LocationInputSerializer(required=False, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    # Optional. Omit it and the requester's own number is used, so the common
    # case costs nothing; supplying one lets whoever raises a ticket for a
    # hostel wing give the caretaker's number instead of their own.
    contact_phone = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=32,
        help_text=CONTACT_PHONE_HELP,
    )

    def validate_contact_phone(self, value):
        try:
            return normalise_phone(value)
        except InvalidPhoneNumber as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate(self, attrs):
        request = self.context["request"]
        user = request.user

        # 1. Resolve the requester's campus from their profile.
        try:
            campus = user.profile.campus
        except Exception:
            campus = None
        if campus is None:
            raise serializers.ValidationError("User has no campus assigned.")

        service_item = attrs["service_item"]

        # 1b. A number for the technician to call, if there is one. Optional
        #     throughout: a missing phone number is not a reason to refuse
        #     someone a repair, and the ticket itself carries the detail.
        contact_phone = attrs.get("contact_phone")
        if not contact_phone:
            # Fall back to the profile, tolerating whatever is stored there —
            # an unusable profile number must not block raising a ticket.
            try:
                contact_phone = normalise_phone(getattr(user, "phone_number", ""))
            except InvalidPhoneNumber:
                contact_phone = ""
        attrs["contact_phone"] = contact_phone

        # 2. Resolve the routing section.
        try:
            section = resolve_routing(campus.id, service_item)
        except ServiceNotAvailableError as exc:
            raise serializers.ValidationError({"service_item": str(exc)}) from exc

        # 3. Every ticket opens at the default (lowest) priority. The HOS sets
        #    the real one when they assign it — they have seen the ticket; the
        #    catalogue has not.
        priority = Priority.default()

        # 4. Where it is. Always required: maintenance work happens somewhere,
        #    and a ticket a technician cannot find is not a ticket. The facility
        #    type decides what "somewhere" means — a room for a hostel, an asset
        #    name for a generator, a zone for a field.
        location_input = attrs.get("location")
        if not location_input:
            raise serializers.ValidationError(
                {"location": "Location is required — the technician has to find it."}
            )
        location_data = validate_location(
            location_input["facility_type"],
            location_input.get("facility"),
            location_input.get("values", {}),
            campus.id,
        )

        # Store private attrs for use in create().
        attrs["_section"] = section
        attrs["_sub_section"] = service_item.sub_section
        attrs["_priority"] = priority
        attrs["_requester_campus"] = campus
        attrs["_location_data"] = location_data

        return attrs

    def create(self, validated_data):
        request = self.context["request"]

        section = validated_data.pop("_section")
        sub_section = validated_data.pop("_sub_section")
        priority = validated_data.pop("_priority")
        requester_campus = validated_data.pop("_requester_campus")
        location_data = validated_data.pop("_location_data")

        # Remove the location input (not a model field).
        validated_data.pop("location", None)

        now = timezone.now()
        response_due_at, resolution_due_at = compute_due_dates(priority, now)

        ticket = Ticket.objects.create(
            raised_by=request.user,
            requester_campus=requester_campus,
            service_item=validated_data["service_item"],
            section=section,
            sub_section=sub_section,
            priority=priority,
            description=validated_data.get("description", ""),
            contact_phone=validated_data["contact_phone"],
            response_due_at=response_due_at,
            resolution_due_at=resolution_due_at,
        )

        if location_data is not None:
            TicketLocation.objects.create(
                ticket=ticket,
                facility_type=location_data["facility_type"],
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
    status = serializers.ChoiceField(
        choices=list(ALL_STATUSES)
    )
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class TicketAssignSerializer(serializers.Serializer):
    """Assignment is where priority is decided.

    A ticket opens at the default (lowest) priority because the requester
    should not be grading their own urgency. The HOS has read it and knows the
    section's workload, so they set the real priority as they hand it out.
    Optional — omitting it leaves whatever the ticket already carries.
    """

    assigned_to = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    priority = serializers.PrimaryKeyRelatedField(
        queryset=Priority.objects.all(), required=False
    )

    def validate(self, attrs):
        ticket = self.context["ticket"]
        if not SectionTechnician.objects.filter(
            section=ticket.section,
            sub_section=ticket.sub_section,
            user=attrs["assigned_to"],
        ).exists():
            raise serializers.ValidationError(
                {
                    "assigned_to": "User is not a technician for this ticket's "
                    "section and sub-section."
                }
            )
        return attrs


class TicketCommentSerializer(serializers.ModelSerializer):
    # Nested author (QA B2e) — the comment header renders name + timestamp,
    # matching the timeline's actor attribution.
    author = _UserMinSerializer(read_only=True)

    class Meta:
        model = TicketComment
        fields = ["id", "author", "body", "visibility", "created_at", "updated_at"]
        read_only_fields = ["id", "author", "created_at", "updated_at"]


class TicketFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketFeedback
        fields = ["id", "rating", "comment", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_rating(self, value):
        if not (1 <= value <= 5):
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value


class TicketFeedbackRowSerializer(serializers.ModelSerializer):
    """A rating as the Feedback tab lists it — flattened, with enough of the
    ticket to know what is being rated and who did the work."""

    ticket_no = serializers.CharField(source="ticket.ticket_no", read_only=True)
    service_item = serializers.SerializerMethodField()
    section = serializers.SerializerMethodField()
    assigned_to = _UserMinSerializer(source="ticket.assigned_to", read_only=True, allow_null=True)
    resolved_at = serializers.DateTimeField(source="ticket.resolved_at", read_only=True)

    class Meta:
        model = TicketFeedback
        fields = [
            "id",
            "ticket_no",
            "service_item",
            "section",
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

    def get_section(self, obj):
        section = obj.ticket.section
        if section is None:
            return ""
        campus = section.campus_department.campus.code
        name = section.section_type.name if section.section_type_id else ""
        return f"{campus} - {name}".strip(" -")


class TicketAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = _UserMinSerializer(read_only=True)
    url = serializers.SerializerMethodField()
    size_saved_pct = serializers.SerializerMethodField()

    class Meta:
        model = TicketAttachment
        fields = [
            "id",
            "original_name",
            "mime_type",
            "original_size",
            "stored_size",
            "size_saved_pct",
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

    def get_size_saved_pct(self, obj):
        if not obj.original_size:
            return 0
        return round((1 - obj.stored_size / obj.original_size) * 100, 1)
