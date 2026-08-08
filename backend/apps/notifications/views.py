from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import Notification


def _serialize_notification(n):
    return {
        "id": str(n.pk),
        "eventType": n.event_type,
        "title": n.title,
        "body": n.body,
        "ticketId": str(n.ticket_id) if n.ticket_id else None,
        "read": n.read,
        "createdAt": n.created_at.isoformat(),
    }


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(user=request.user).order_by("-created_at")[:50]
        data = [_serialize_notification(n) for n in qs]
        return Response(
            {
                "data": data,
                "unreadCount": sum(1 for n in data if not n["read"]),
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
