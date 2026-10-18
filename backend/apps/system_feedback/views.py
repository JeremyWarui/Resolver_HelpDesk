"""Anyone signed in sends system feedback; the admin reads and reviews it."""

from rest_framework import generics
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

from apps.common.roles import IsAdminGroup, resolve_role
from apps.system_feedback.models import SystemFeedback
from apps.system_feedback.serializers import (
    SystemFeedbackReviewSerializer,
    SystemFeedbackSerializer,
)


class SystemFeedbackListCreateView(generics.ListCreateAPIView):
    """POST /system-feedback/ — anyone signed in. GET — the admin only.

    `?status=new` or `?status=reviewed` narrows the list.
    """

    serializer_class = SystemFeedbackSerializer
    permission_classes = [IsAuthenticated]
    throttle_scope = "system_feedback"

    def get_throttles(self):
        # Sending is limited; the admin reading the list is not.
        if self.request.method == "POST":
            return [ScopedRateThrottle()]
        return []

    def get_queryset(self):
        if resolve_role(self.request) != "admin":
            raise PermissionDenied("Only the admin reads system feedback.")
        qs = SystemFeedback.objects.select_related("author__campus").order_by(
            "-created_at"
        )
        status = self.request.query_params.get("status")
        if status == "new":
            qs = qs.filter(reviewed=False)
        elif status == "reviewed":
            qs = qs.filter(reviewed=True)
        elif status:
            raise ValidationError({"status": "Must be new or reviewed."})
        return qs

    def perform_create(self, serializer):
        serializer.save(
            author=self.request.user,
            author_role=resolve_role(self.request) or "user",
        )


class SystemFeedbackReviewView(generics.UpdateAPIView):
    """PATCH /system-feedback/{id}/ — the admin marks it reviewed, or new again."""

    serializer_class = SystemFeedbackReviewSerializer
    permission_classes = [IsAdminGroup]
    queryset = SystemFeedback.objects.all()
    http_method_names = ["patch"]
