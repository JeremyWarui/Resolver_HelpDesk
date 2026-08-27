"""Read and write shape for priorities."""

from rest_framework import serializers

from apps.sla.models import Priority


class PrioritySerializer(serializers.ModelSerializer):
    class Meta:
        model = Priority
        fields = [
            "id",
            "name",
            "rank",
            "response_minutes",
            "resolution_minutes",
            "escalate_to_hos_minutes",
            "escalate_to_hod_minutes",
        ]
