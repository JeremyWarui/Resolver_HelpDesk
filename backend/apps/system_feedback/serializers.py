"""System feedback as sent, and as the admin reads it."""

from rest_framework import serializers

from apps.accounts.identity import display_name
from apps.system_feedback.models import SystemFeedback

MESSAGE_MIN = 5


class SystemFeedbackSerializer(serializers.ModelSerializer):
    """Who sent it is taken from the request, never from the body."""

    author_name = serializers.SerializerMethodField()
    author_campus = serializers.SerializerMethodField()

    class Meta:
        model = SystemFeedback
        fields = [
            "id",
            "category",
            "message",
            "page",
            "reviewed",
            "created_at",
            "author_name",
            "author_role",
            "author_campus",
        ]
        read_only_fields = ["id", "reviewed", "created_at", "author_role"]

    def validate_message(self, value):
        value = value.strip()
        if len(value) < MESSAGE_MIN:
            raise serializers.ValidationError(
                f"Say a little more: at least {MESSAGE_MIN} characters."
            )
        return value

    def get_author_name(self, obj):
        return display_name(obj.author) or "Deleted account"

    def get_author_campus(self, obj):
        campus = obj.author.campus if obj.author else None
        return campus.name if campus else None


class SystemFeedbackReviewSerializer(serializers.ModelSerializer):
    """The admin's one change: marking it reviewed, or back to new."""

    class Meta:
        model = SystemFeedback
        fields = ["reviewed"]
