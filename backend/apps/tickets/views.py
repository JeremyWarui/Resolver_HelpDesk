"""
The ticket endpoints: the scoped list, one ticket, and every action on it.

A view never writes a Ticket — it calls `tickets.lifecycle`. Everything under
`/tickets/<pk>/` is fetched through `get_ticket_for_request_or_403()`: the pk is
client-supplied and scope is not.
"""

from rest_framework import generics, serializers as drf_serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import get_object_or_404

import os

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.tickets.models import (
    Ticket,
    TicketAttachment,
    TicketLog,
    TicketComment,
)
from apps.tickets.serializers import (
    AuditLogRowSerializer,
    TicketCreateSerializer,
    TicketReadSerializer,
    TicketDetailReadSerializer,
    TicketStatusUpdateSerializer,
    TicketAssignSerializer,
    TicketCommentSerializer,
    TicketFeedbackSerializer,
    TicketFeedbackRowSerializer,
    TicketLogSerializer,
    TicketAttachmentSerializer,
)
from apps.tickets.constants import (
    ACTIVE_STATUSES,
    ESCALATED_LEVELS,
    PENDING_REASONS,
    TERMINAL_STATUSES,
)
from apps.tickets.attachments import (
    process_upload,
    MAX_ATTACHMENTS_PER_TICKET,
    MIME_TO_EXT,
)
from apps.tickets.lifecycle import (
    assign_ticket,
    claim_ticket,
    transition_status,
    TransitionError,
)
from apps.tickets.scope import scoped_ticket_qs, ticket_base_qs
from apps.tickets.sla import q_overdue
from apps.common.pagination import AppendOnlyFeedPagination
from apps.common.roles import (
    IsAdminGroup,
    TICKET_SUPERVISOR_ROLES,
    resolve_role,
)
from apps.notifications.notify import emit_ticket_created, emit_comment_added
from apps.accounts.identity import display_name_parts


def get_ticket_for_request_or_403(
    request, pk, *, allow_requester=True, supervisor_only=False, qs=None
):
    """Fetch a ticket, or 403. The IDOR guard every action view goes through.

    Your own ticket, or one inside your role's scope; `supervisor_only` narrows
    that to the roles that may direct a ticket. Fails closed.
    """
    ticket = get_object_or_404(qs if qs is not None else Ticket, pk=pk)

    if allow_requester and ticket.raised_by_id == request.user.pk:
        return ticket

    role = resolve_role(request)
    if supervisor_only and role not in TICKET_SUPERVISOR_ROLES:
        raise PermissionDenied("You do not have permission to perform this action.")
    if not scoped_ticket_qs(request.user, role).filter(pk=ticket.pk).exists():
        raise PermissionDenied("You do not have access to this ticket.")
    return ticket


def refuse_read_only_roles(request):
    """Refuse the manager any write on a ticket.

    Their scope is every campus and their authority none of it, so scope alone
    lets them through.
    """
    if resolve_role(request) == "manager":
        raise PermissionDenied("A manager has read-only oversight of tickets.")


class TicketStatusView(APIView):
    """POST /tickets/{pk}/status/ — move a ticket, if this caller is allowed to."""

    permission_classes = [IsAuthenticated]

    REQUESTER_TARGETS = ("closed", "open")

    def post(self, request, pk):
        """Apply the transition, or 403 if this caller may not make it."""
        ticket = get_ticket_for_request_or_403(request, pk)
        serializer = TicketStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        role = resolve_role(request)
        is_assigned_tech = (
            role == "technician" and ticket.assigned_to_id == request.user.pk
        )
        is_supervisor = role in TICKET_SUPERVISOR_ROLES
        is_requester = ticket.raised_by_id == request.user.pk
        if not (is_supervisor or is_assigned_tech):
            if not (
                is_requester
                and serializer.validated_data["status"] in self.REQUESTER_TARGETS
            ):
                raise PermissionDenied(
                    "You do not have permission to change this ticket's status."
                )

        try:
            transition_status(
                ticket,
                serializer.validated_data["status"],
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
                pending_reason=serializer.validated_data.get("pending_reason", ""),
                pending_reason_note=serializer.validated_data.get(
                    "pending_reason_note", ""
                ),
            )
        except TransitionError as e:
            return Response({"detail": str(e)}, status=400)
        return Response(
            {"ticket_no": ticket.ticket_no, "status": ticket.status}, status=200
        )


class TicketAssignView(APIView):
    """POST /tickets/{pk}/assign/ — hand a ticket to a technician, and set its priority.

    Supervisors only: who holds a job and how urgent it is are the HOS's calls.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        """Assign or reassign, optionally with the real priority."""
        ticket = get_ticket_for_request_or_403(
            request,
            pk,
            allow_requester=False,
            supervisor_only=True,
            qs=Ticket.objects.select_related("service_item", "assigned_to", "priority"),
        )
        serializer = TicketAssignSerializer(
            data=request.data, context={"ticket": ticket}
        )
        serializer.is_valid(raise_exception=True)
        assignee = serializer.validated_data["assigned_to"]
        new_priority = serializer.validated_data.get("priority")
        note = serializer.validated_data.get("note", "")

        try:
            assign_ticket(
                ticket, assignee, request.user, priority=new_priority, note=note
            )
        except TransitionError as e:
            return Response({"detail": str(e)}, status=400)

        return Response(
            {
                "assigned_to": assignee.pk,
                "status": ticket.status,
                "priority": ticket.priority_id,
            },
            status=200,
        )


class TicketClaimView(APIView):
    """POST /tickets/{pk}/claim/ — a technician takes an unassigned open ticket.

    Two technicians claiming at once is the case that matters: the row lock
    makes one win and the other get a 409.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        """Claim it, or 409 if somebody else already has."""
        if resolve_role(request) != "technician":
            raise PermissionDenied("Only technicians may claim tickets.")

        try:
            with transaction.atomic():
                ticket = get_ticket_for_request_or_403(
                    request,
                    pk,
                    allow_requester=False,
                    qs=Ticket.objects.select_for_update(),
                )
                claim_ticket(ticket, request.user)
        except TransitionError as e:
            return Response({"detail": str(e)}, status=status.HTTP_409_CONFLICT)

        return Response(
            {
                "ticket_no": ticket.ticket_no,
                "status": ticket.status,
                "assigned_to": request.user.pk,
            },
            status=200,
        )


class TicketCommentListCreateView(generics.ListCreateAPIView):
    """GET and POST /tickets/{pk}/comments/ — the conversation on one ticket."""

    permission_classes = [IsAuthenticated]
    serializer_class = TicketCommentSerializer
    pagination_class = AppendOnlyFeedPagination

    def get_queryset(self):
        """The staff working log for this ticket. Never the requester's to read."""
        ticket = self._ticket_for_staff()
        return TicketComment.objects.filter(ticket=ticket).order_by("-created_at")

    def _ticket_for_staff(self):
        """Scope-check the ticket, then refuse the two roles with no business here.

        The requester is out because comments are the staff log, not a
        conversation with them; the manager is out because their access is
        read-only oversight, never operational.
        """
        ticket = get_ticket_for_request_or_403(self.request, self.kwargs["pk"])
        if ticket.raised_by_id == self.request.user.pk:
            raise PermissionDenied("Comments on a ticket are not shown to its raiser.")
        refuse_read_only_roles(self.request)
        return ticket

    def perform_create(self, serializer):
        """Post a comment, if the ticket is open to comments and this caller may."""
        ticket = self._ticket_for_staff()

        if ticket.status == "closed":
            raise drf_serializers.ValidationError(
                {"detail": "Comments are disabled on a closed ticket."}
            )
        if ticket.assigned_to_id is None:
            raise drf_serializers.ValidationError(
                {"detail": "Comments open once a technician is assigned."}
            )
        if (
            resolve_role(self.request) == "technician"
            and ticket.assigned_to_id != self.request.user.pk
        ):
            raise PermissionDenied(
                "Only the assigned technician may comment on this ticket."
            )

        serializer.save(ticket=ticket, author=self.request.user)
        TicketLog.objects.create(
            ticket=ticket,
            actor=self.request.user,
            event_type="comment_added",
            to_value=str(serializer.instance.pk),
        )
        emit_comment_added(ticket, serializer.instance)


class TicketFeedbackView(APIView):
    """POST /tickets/{pk}/feedback/ — the requester rates the finished job."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        """Record the rating. Requester only, once, and only after it is resolved."""
        ticket = get_ticket_for_request_or_403(request, pk)

        if ticket.raised_by != request.user:
            raise PermissionDenied("Only the requester can submit feedback.")

        if ticket.status not in TERMINAL_STATUSES:
            return Response(
                {
                    "detail": "Feedback can only be submitted once the ticket is resolved."
                },
                status=400,
            )

        # `rated_at`, not `rating`: a one-star rating is still a rating.
        if ticket.rated_at is not None:
            return Response(
                {"detail": "Feedback has already been submitted."},
                status=409,
            )

        serializer = TicketFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ticket.rating = serializer.validated_data["rating"]
        ticket.rating_comment = serializer.validated_data["comment"]
        ticket.rated_at = timezone.now()
        ticket.save(
            update_fields=["rating", "rating_comment", "rated_at", "updated_at"]
        )

        TicketLog.objects.create(
            ticket=ticket,
            actor=request.user,
            event_type="rated",
            to_value=str(ticket.rating),
        )

        return Response(
            {
                "rating": ticket.rating,
                "comment": ticket.rating_comment,
                "created_at": ticket.rated_at,
            },
            status=201,
        )


class TicketLogListView(generics.ListAPIView):
    """GET /tickets/{pk}/logs/ — the ticket's timeline, newest first.

    This is what the requester gets in place of comments: the trail of what
    happened to their ticket — opened, assigned, started, paused, resolved,
    closed — without the staff working log.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = TicketLogSerializer
    pagination_class = AppendOnlyFeedPagination

    def get_queryset(self):
        """Every log row for this ticket, minus the staff-only events for its raiser."""
        ticket = get_ticket_for_request_or_403(self.request, self.kwargs["pk"])
        qs = (
            TicketLog.objects.filter(ticket=ticket)
            .select_related("actor", "level_user")
            .order_by("-created_at")
        )
        if ticket.raised_by_id == self.request.user.pk:
            # A "Comment added" row the requester can never open is a dead end
            # pointing at the staff log. The trail itself stays complete for
            # staff and in the admin audit log.
            qs = qs.exclude(event_type="comment_added")
        return qs


class TicketListCreateView(generics.ListCreateAPIView):
    """GET and POST /tickets/ — the role-scoped list, and raising a new one.

    `?mine=1` asks a different question from role scope, and is open to
    everyone: someone with no role at all still gets their own tickets.
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        """The write shape for a create, the read shape for a list."""
        if self.request.method == "POST":
            return TicketCreateSerializer
        return TicketReadSerializer

    def create(self, request, *args, **kwargs):
        """Raise a ticket and return its number."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save()
        emit_ticket_created(ticket)
        return Response(
            {"id": ticket.id, "ticket_no": ticket.ticket_no},
            status=status.HTTP_201_CREATED,
        )

    def get_queryset(self):
        """Scope first, then the filters. In that order, and never the reverse."""
        user = self.request.user
        params = self.request.query_params

        if params.get("mine") == "1":
            # The literal "user", never the caller's role: ?mine=1 can only narrow.
            qs = scoped_ticket_qs(user, "user")
        else:
            qs = scoped_ticket_qs(user, resolve_role(self.request))

        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("priority"):
            qs = qs.filter(priority_id=params["priority"])
        if params.get("campus"):
            qs = qs.filter(requester_campus_id=params["campus"])
        if params.get("trade"):
            qs = qs.filter(trade_id=params["trade"])
        if params.get("assigned_to"):
            qs = qs.filter(assigned_to_id=params["assigned_to"])
        if params.get("raised_by"):
            qs = qs.filter(raised_by_id=params["raised_by"])
        if params.get("current_level"):
            qs = qs.filter(current_level=params["current_level"])
        # Active only: `current_level` survives resolution, so a closed job keeps it.
        if params.get("escalated") == "1":
            qs = qs.filter(
                current_level__in=ESCALATED_LEVELS, status__in=ACTIVE_STATUSES
            )
        # The same Q analytics counts as `breached`, so the pill and the card agree.
        if params.get("overdue") == "1":
            qs = qs.filter(q_overdue())

        return qs


class TicketFilterOptionsView(APIView):
    """GET /tickets/filter-options/ — what the tickets-table dropdowns may offer.

    Built from the caller's own scoped tickets: any other source offers filters
    that come back empty, and leaks the names of people they cannot see.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _people(scoped, prefix, exclude_null=False):
        """Distinct people on `prefix` (assigned_to / raised_by), sorted by name.

        Columns rather than instances, so the whole list is one query. That is
        why it is display_name_parts and not display_name.
        """
        rows = scoped.exclude(**{f"{prefix}__isnull": True}) if exclude_null else scoped
        rows = (
            rows.values(
                f"{prefix}_id",
                f"{prefix}__first_name",
                f"{prefix}__last_name",
                f"{prefix}__username",
            )
            .order_by()
            .distinct()
        )
        return sorted(
            (
                {
                    "id": r[f"{prefix}_id"],
                    "name": display_name_parts(
                        r[f"{prefix}__first_name"],
                        r[f"{prefix}__last_name"],
                        r[f"{prefix}__username"],
                    ),
                }
                for r in rows
            ),
            key=lambda p: p["name"].lower(),
        )

    def get(self, request):
        """The four lists, plus the hold vocabulary."""
        role = resolve_role(request)
        scoped = scoped_ticket_qs(request.user, role)

        campus_rows = (
            scoped.values("requester_campus_id", "requester_campus__name")
            .order_by()
            .distinct()
        )
        campuses = sorted(
            (
                {"id": r["requester_campus_id"], "name": r["requester_campus__name"]}
                for r in campus_rows
            ),
            key=lambda c: c["name"].lower(),
        )

        trade_rows = (
            scoped.exclude(trade__isnull=True)
            .values("trade_id", "trade__name")
            .order_by()
            .distinct()
        )
        trades = sorted(
            ({"id": r["trade_id"], "name": r["trade__name"]} for r in trade_rows),
            key=lambda s: s["name"].lower(),
        )

        technicians = self._people(scoped, "assigned_to", exclude_null=True)
        requesters = self._people(scoped, "raised_by")

        return Response(
            {
                "campuses": campuses,
                "trades": trades,
                "technicians": technicians,
                "requesters": requesters,
                "pending_reasons": [
                    {"value": code, "label": label} for code, label in PENDING_REASONS
                ],
            }
        )


class TicketDetailView(generics.RetrieveAPIView):
    """GET /tickets/{pk}/ — one ticket, if the caller may see it.

    Out of scope is a 403, not a 404: the ticket exists, you may not read it.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = TicketDetailReadSerializer

    def get_object(self):
        """Through the IDOR guard, like every other single-ticket read."""
        return get_ticket_for_request_or_403(
            self.request,
            self.kwargs["pk"],
            qs=ticket_base_qs(),
        )


class TicketAttachmentView(APIView):
    """GET and POST /tickets/{pk}/attachments/ — the files on one ticket.

    Reachable means readable; acting on the ticket means you may add one.
    Deleting is narrower and lives on its own route.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """List this ticket's attachments."""
        ticket = get_ticket_for_request_or_403(request, pk)
        qs = ticket.attachments.select_related("uploaded_by")
        serializer = TicketAttachmentSerializer(
            qs, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request, pk):
        """Upload one or more files, compressing each before it is stored."""
        ticket = get_ticket_for_request_or_403(request, pk)
        # An upload is a write on the ticket.
        refuse_read_only_roles(request)

        current_count = ticket.attachments.count()
        if current_count >= MAX_ATTACHMENTS_PER_TICKET:
            return Response(
                {
                    "detail": f"Maximum {MAX_ATTACHMENTS_PER_TICKET} attachments per ticket."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        files = request.FILES.getlist("files") or (
            [request.FILES["file"]] if "file" in request.FILES else []
        )
        if not files:
            return Response(
                {"detail": "No file(s) provided. Use 'files' or 'file' field."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        slots_left = MAX_ATTACHMENTS_PER_TICKET - current_count
        if len(files) > slots_left:
            return Response(
                {"detail": f"Only {slots_left} attachment slot(s) remaining."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = []
        for f in files:
            content_type = f.content_type or "application/octet-stream"
            try:
                processed_bytes, final_mime = process_upload(f, content_type)
            except DjangoValidationError as exc:
                return Response(
                    {"detail": str(exc.message)},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            ext = MIME_TO_EXT.get(final_mime, os.path.splitext(f.name)[1].lower())
            base_name = os.path.splitext(f.name)[0]
            stored_name = f"{base_name}{ext}"

            attachment = TicketAttachment(
                ticket=ticket,
                original_name=f.name,
                mime_type=final_mime,
                stored_size=len(processed_bytes),
                uploaded_by=request.user,
            )
            attachment.file.save(stored_name, ContentFile(processed_bytes), save=False)
            attachment.save()
            created.append(attachment)

        serializer = TicketAttachmentSerializer(
            created, many=True, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TicketAttachmentDetailView(APIView):
    """DELETE /tickets/{pk}/attachments/{att_id}/ — remove one file.

    Its own view because the two routes carry different URL kwargs: one class
    serving both made `DELETE` on the collection a 500.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, att_id):
        """Delete one attachment. Uploader or supervisor only."""
        ticket = get_ticket_for_request_or_403(request, pk)
        attachment = get_object_or_404(TicketAttachment, pk=att_id, ticket=ticket)

        is_uploader = attachment.uploaded_by_id == request.user.pk
        is_supervisor = resolve_role(request) in TICKET_SUPERVISOR_ROLES
        if not (is_uploader or is_supervisor):
            raise PermissionDenied("You can only delete your own attachments.")

        attachment.file.delete(save=False)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminAuditLogView(generics.ListAPIView):
    """GET /admin/audit-log/ — every TicketLog row in the system, admin only.

    The one read here that is not ticket-scoped, which is the point of an audit
    log. Admin is the `admin` role, never `user.is_staff`.
    """

    permission_classes = [IsAuthenticated, IsAdminGroup]
    serializer_class = AuditLogRowSerializer

    def get_queryset(self):
        """Every log row, filtered by whatever the admin asked for."""
        qs = TicketLog.objects.select_related("actor", "ticket").order_by("-created_at")

        params = self.request.query_params
        if actor := params.get("actor"):
            # The list renders names, so searching username alone misses rows in view.
            qs = qs.filter(
                Q(actor__username__icontains=actor)
                | Q(actor__first_name__icontains=actor)
                | Q(actor__last_name__icontains=actor)
            )
        if action := params.get("action"):
            qs = qs.filter(event_type=action)
        if date_from := params.get("date_from"):
            qs = qs.filter(created_at__gte=date_from)
        if date_to := params.get("date_to"):
            qs = qs.filter(created_at__lte=date_to)

        return qs


class TicketFeedbackListView(generics.ListAPIView):
    """GET /tickets/feedback/ — the rated tickets inside the caller's scope.

    Ordinary ticket scope, so a technician sees the ratings on every ticket in
    their (campus, trade) pairs, including work they did not do. A trade's
    reputation is shared.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = TicketFeedbackRowSerializer

    def get_queryset(self):
        """Rated tickets the caller can see, newest rating first."""
        role = resolve_role(self.request)
        qs = scoped_ticket_qs(self.request.user, role).filter(rated_at__isnull=False)

        params = self.request.query_params
        if params.get("rating"):
            qs = qs.filter(rating=params["rating"])
        if params.get("date_from"):
            qs = qs.filter(rated_at__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(rated_at__lte=params["date_to"])
        return qs.order_by("-rated_at")
