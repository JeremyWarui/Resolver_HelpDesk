"""Read and write shape for priorities."""

from rest_framework import serializers

from apps.sla.models import Priority

# Both are ordered pairs, and each names the field that must not exceed the
# other. Response comes before resolution; the HOS threshold before the HOD's.
ORDERED_PAIRS = (
    ("response_minutes", "resolution_minutes"),
    ("escalate_to_hos_minutes", "escalate_to_hod_minutes"),
)


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

    def validate(self, attrs):
        """Keep both pairs in order.

        Escalation is a sequence — technician, then HOS, then HOD — so an HOD
        threshold below the HOS one is not a slow escalation but an unordered
        one, and `escalation.thresholds()` would hand back steps that fire out
        of sequence. Likewise a resolution target inside the response target
        asks for the job to be finished before it has been picked up.
        """
        for earlier, later in ORDERED_PAIRS:
            # A PATCH carries only what changed, so each side is judged on the
            # row the write would produce, not on the fields it happens to send.
            first = attrs.get(earlier, getattr(self.instance, earlier))
            second = attrs.get(later, getattr(self.instance, later))
            if first > second:
                raise serializers.ValidationError(
                    {later: f"Must be at least {earlier} ({first})."}
                )
        return attrs
