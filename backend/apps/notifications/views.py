"""The notification feed, and marking rows read. Polled, never pushed."""

from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import Notification


def _serialize_notification(n):
    """One notification row, in the snake_case every other endpoint uses."""
    return {
        "id": n.pk,
        "event_type": n.event_type,
        "title": n.title,
        "body": n.body,
        "ticket_id": n.ticket_id,
        "read": n.read,
        "created_at": n.created_at.isoformat(),
    }


class NotificationListView(APIView):
    """GET /notifications/ — the caller's own feed, newest first.

    `unread_count` covers the whole feed so the bell badge does not stop at
    the page.
    """

    permission_classes = [IsAuthenticated]

    FEED_LIMIT = 50

    def get(self, request):
        own = Notification.objects.filter(user=request.user)
        rows = own.order_by("-created_at")[: self.FEED_LIMIT]
        return Response(
            {
                "results": [_serialize_notification(n) for n in rows],
                "unread_count": own.filter(read=False).count(),
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
