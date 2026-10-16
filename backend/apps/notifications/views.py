"""The notification feed, and marking rows read. Polled, never pushed."""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.identity import display_name
from apps.notifications.models import Notification

EVENT_TYPES = {code for code, _ in Notification.EVENT_TYPES}


def _whole_number(params, name, default=None):
    """The param as an int, the default when absent, or a 400.

    ASCII digits only: `str.isdigit()` also passes "²", which `int()` rejects.
    """
    value = params.get(name)
    if value in (None, ""):
        return default
    if not (value.isascii() and value.isdigit()):
        raise ValidationError({name: "Must be a whole number."})
    return int(value)


def _serialize_notification(n):
    """One notification row, in the snake_case every other endpoint uses."""
    return {
        "id": n.pk,
        "event_type": n.event_type,
        "title": n.title,
        "body": n.body,
        "ticket_id": n.ticket_id,
        # Who acted and what they wrote; null and "" for a message with no sender's words.
        "actor_name": display_name(n.actor) or None,
        "note": n.note,
        "read": n.read,
        "created_at": n.created_at.isoformat(),
    }


class NotificationListView(APIView):
    """GET /notifications/ — the caller's own feed, newest first.

    `?limit=` sets the page size (50 unless asked, at most 100), `?unread=1`
    keeps unread rows, `?event_type=a,b` keeps those types, and `?before=<id>`
    returns the page after that row. `unread_count` covers the whole feed,
    whatever the filters, so the badge does not stop at the page.
    """

    permission_classes = [IsAuthenticated]

    FEED_LIMIT = 50
    MAX_LIMIT = 100

    def get(self, request):
        own = Notification.objects.filter(user=request.user)
        params = request.query_params

        limit = _whole_number(params, "limit", default=self.FEED_LIMIT)
        if limit < 1:
            raise ValidationError({"limit": "Must be a whole number from 1."})
        limit = min(limit, self.MAX_LIMIT)

        rows = own
        if params.get("unread") == "1":
            rows = rows.filter(read=False)
        if params.get("event_type"):
            types = set(params["event_type"].split(","))
            unknown = types - EVENT_TYPES
            if unknown:
                raise ValidationError({"event_type": f"Unknown: {', '.join(sorted(unknown))}."})
            rows = rows.filter(event_type__in=types)
        before = _whole_number(params, "before")
        if before is not None:
            # The page after that row in time order. Its own feed only, so an id
            # from someone else's feed pages nothing rather than leaking a time.
            anchor = own.filter(pk=before).values_list("created_at", flat=True).first()
            if anchor is None:
                rows = rows.none()
            else:
                rows = rows.filter(
                    Q(created_at__lt=anchor) | Q(created_at=anchor, pk__lt=before)
                )

        # Newest first by when it happened; the id breaks ties so paging never
        # skips or repeats a row.
        page = list(rows.select_related("actor").order_by("-created_at", "-pk")[: limit + 1])
        return Response(
            {
                "results": [_serialize_notification(n) for n in page[:limit]],
                "unread_count": own.filter(read=False).count(),
                "has_more": len(page) > limit,
            }
        )


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        n = get_object_or_404(Notification, pk=pk, user=request.user)
        n.read = True
        n.save(update_fields=["read"])
        return Response(status=204)


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, read=False).update(read=True)
        return Response(status=204)
