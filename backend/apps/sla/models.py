"""Priority levels and the two escalation thresholds each one carries."""

from django.db import models


class Priority(models.Model):
    """A named priority level with its SLA targets and escalation thresholds.

    Priorities are system-wide and are **not** a property of the service
    catalogue. A ticket opens at the default (lowest rank) and the HOS sets the
    real priority when they assign it.

    rank: 1 = lowest, 4 = highest (used for ordering and for `default()`).
    response_minutes: target from ticket creation to first assignment.
    resolution_minutes: target from ticket creation to resolved status.
    escalate_to_hos_minutes / escalate_to_hod_minutes: the two structural
    thresholds. Escalation is technician to HOS to HOD and nothing else, so
    these are columns rather than a configurable rule table.
    """

    name = models.CharField(max_length=80)
    rank = models.PositiveIntegerField(unique=True)
    response_minutes = models.PositiveIntegerField()
    resolution_minutes = models.PositiveIntegerField()
    escalate_to_hos_minutes = models.PositiveIntegerField()
    escalate_to_hod_minutes = models.PositiveIntegerField()

    class Meta:
        app_label = "sla"
        ordering = ["rank"]
        verbose_name_plural = "Priorities"

    def __str__(self):
        return f"{self.name} (rank {self.rank})"

    @classmethod
    def default(cls):
        """The priority a ticket opens at — lowest rank, i.e. Low.

        Raises if no priorities are seeded: a ticket cannot exist without one,
        and failing loudly here beats a null FK surfacing later in SLA maths.
        """
        priority = cls.objects.order_by("rank").first()
        if priority is None:
            raise RuntimeError(
                "No Priority rows exist — seed the SLA reference data first."
            )
        return priority
