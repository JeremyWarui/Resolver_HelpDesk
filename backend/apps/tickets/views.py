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

from apps.tickets.models import (
    Ticket,
    TicketAttachment,
    TicketLog,
    TicketComment,
)
from apps.tickets.serializers import (
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
    REQUESTER_COMMENT_STATUSES,
)
from apps.tickets.attachments import (
    process_upload,
    MAX_ATTACHMENTS_PER_TICKET,
    MIME_TO_EXT,
)
from apps.tickets.lifecycle import (
    AlreadyRated,
    assign_ticket,
    claim_ticket,
    rate_ticket,
    transition_status,
    TransitionError,
)
from apps.tickets.scope import (
    listed_ticket_qs,
    reporting_ticket_qs,
    scoped_ticket_qs,
    ticket_base_qs,
)
from apps.tickets.sla import q_overdue
from apps.analytics import metrics
from apps.common.pagination import AppendOnlyFeedPagination
from apps.common.roles import TICKET_SUPERVISOR_ROLES, resolve_role
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


def views_as_requester(request, ticket):
    """Whether the caller sees this ticket only as the person who raised it.

    Staff who raised a ticket inside their own scope still work it as staff:
    the electrician who reports a fault in their own trade can claim it and
    keep its working log.
    """
    if ticket.raised_by_id != request.user.pk:
        return False
    role = resolve_role(request)
    if role in (None, "user", "manager"):
        return True
    return not scoped_ticket_qs(request.user, role).filter(pk=ticket.pk).exists()


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
    """GET and POST /tickets/{pk}/comments/ — the staff working log on one ticket.

    Staff in scope read and post, including staff who raised the ticket. A
    requester who is not staff on it reads it only while the ticket is pending
    or resolved, and never posts.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = TicketCommentSerializer
    pagination_class = AppendOnlyFeedPagination

    def get_queryset(self):
        """This ticket's comments, newest first, if this caller may read them."""
        ticket = get_ticket_for_request_or_403(self.request, self.kwargs["pk"])
        if (
            views_as_requester(self.request, ticket)
            and ticket.status not in REQUESTER_COMMENT_STATUSES
        ):
            raise PermissionDenied(
                "Comments are shown to the requester while the ticket is "
                "pending or resolved."
            )
        return TicketComment.objects.filter(ticket=ticket).order_by("-created_at")

    def perform_create(self, serializer):
        """Post a comment, if the ticket is open to comments and this caller may."""
        ticket = get_ticket_for_request_or_403(self.request, self.kwargs["pk"])
        if views_as_requester(self.request, ticket):
            raise PermissionDenied("The requester cannot post comments.")

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
        """Rate and close. Requester only, once per resolution."""
        with transaction.atomic():
            ticket = get_ticket_for_request_or_403(
                request, pk, qs=Ticket.objects.select_for_update()
            )
            if ticket.raised_by_id != request.user.pk:
                raise PermissionDenied("Only the requester can submit feedback.")

            serializer = TicketFeedbackSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            try:
                rate_ticket(
                    ticket,
                    request.user,
                    serializer.validated_data["rating"],
                    serializer.validated_data["comment"],
                )
            except AlreadyRated as e:
                return Response({"detail": str(e)}, status=409)
            except TransitionError as e:
                return Response({"detail": str(e)}, status=400)

        return Response(
            {
                "rating": ticket.rating,
                "comment": ticket.rating_comment,
                "created_at": ticket.rated_at,
                "status": ticket.status,
            },
            status=201,
        )


class TicketLogListView(generics.ListAPIView):
    """GET /tickets/{pk}/logs/ — the ticket's timeline, newest first.

    The requester's copy leaves out comment events: the comments themselves
    are shown to them only at some statuses.
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
        self.as_requester = views_as_requester(self.request, ticket)
        if self.as_requester:
            qs = qs.exclude(event_type="comment_added")
        return qs

    def get_serializer_context(self):
        # The HOS's handover note is written for the technician alone.
        return {
            **super().get_serializer_context(),
            "hide_handover": getattr(self, "as_requester", False),
        }


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
            qs = listed_ticket_qs(user, resolve_role(self.request))

        # "active" is every live status at once: what a worklist shows by default.
        if params.get("status") == "active":
            qs = qs.filter(status__in=ACTIVE_STATUSES)
        elif params.get("status"):
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
        scoped = listed_ticket_qs(request.user, role)

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

    def retrieve(self, request, *args, **kwargs):
        """The ticket, plus whether this caller sees it only as its requester."""
        ticket = self.get_object()
        data = self.get_serializer(ticket).data
        data["viewer_is_requester"] = views_as_requester(request, ticket)
        return Response(data)


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


FEEDBACK_ROLES = ("admin", "manager", "hod", "hos", "technician")


def rated_in_period(request):
    """Tickets the caller reports on that were rated in the requested period.

    A technician reads the ratings on jobs assigned to them; a supervisor
    their campus; the manager and admin every campus. A requester has none.
    The period is the Reports page's (`days`, or `date_from` and `date_to`),
    measured on when the rating was given. A client paging through a list
    sends a fixed `date_from` and `date_to`, so the window cannot move
    between pages.
    """
    role = resolve_role(request)
    if role not in FEEDBACK_ROLES:
        raise PermissionDenied("Ratings are listed for staff only.")
    qs = reporting_ticket_qs(request.user, role).filter(rated_at__isnull=False)
    return metrics.rated_in(qs, metrics.resolve_window(request.query_params))


class TicketFeedbackListView(generics.ListAPIView):
    """GET /tickets/feedback/: the period's ratings, newest first, 20 a page.

    `?rating=1..5` narrows to one star; anything else is a 400.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = TicketFeedbackRowSerializer

    def get_queryset(self):
        qs = rated_in_period(self.request)
        rating = self.request.query_params.get("rating")
        if rating is not None:
            if rating not in {str(s) for s in metrics.STARS}:
                raise drf_serializers.ValidationError({"rating": "Must be a whole number from 1 to 5."})
            qs = qs.filter(rating=int(rating))
        return qs.order_by("-rated_at", "-id")


class TicketFeedbackSummaryView(APIView):
    """GET /tickets/feedback/summary/: the period's figures, over every rating in it.

    `?rating` is ignored: the figures are always the whole period's.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(metrics.ratings(rated_in_period(request)))
