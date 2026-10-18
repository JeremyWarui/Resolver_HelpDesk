"""Priority levels and the two escalation thresholds each one carries.

Reference data, and nothing else: no row here knows a ticket exists.
"""

from datetime import timedelta

from django.core.validators import MinValueValidator
from django.db import models

# The four levels the system ships with, in rank order, as
# (name, rank, response, resolution, escalate_to_hos, escalate_to_hod) minutes.
# Both `seed` and the test factories create their rows from this one table.
PRIORITY_LEVELS = [
    ("Low", 1, 480, 4320, 2880, 5760),  # 8h response, 3d resolution
    ("Medium", 2, 240, 1440, 720, 1440),  # 4h response, 1d resolution
    ("High", 3, 60, 480, 240, 480),  # 1h response, 8h resolution
    ("Critical", 4, 30, 120, 60, 120),  # 30m response, 2h resolution
]


class Priority(models.Model):
    """A named priority level with its SLA targets and escalation thresholds.

    Priorities are system-wide and are **not** a property of the service
    catalogue. A ticket opens at the default (lowest rank) and the HOS sets the
    real priority when they assign it.

    Escalation is technician to HOS to HOD and nothing else, so the two
    thresholds are columns here.
    """

    # Unique because the trail records a priority change by name
    # (`TicketLog.from_value`), and two rows called "High" make it unreadable.
    name = models.CharField(max_length=80, unique=True)
    rank = models.PositiveIntegerField(unique=True)  # 1 = lowest, and the default
    # A zero-minute target is a ticket born overdue, so every window is >= 1.
    response_minutes = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    resolution_minutes = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    escalate_to_hos_minutes = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    escalate_to_hod_minutes = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )

    class Meta:
        app_label = "sla"
        ordering = ["rank"]
        verbose_name_plural = "Priorities"

    def __str__(self):
        return f"{self.name} (rank {self.rank})"

    def due_dates(self, start):
        """Return (response_due_at, resolution_due_at) measured from `start`.

        Called at ticket creation, again on reopen, which restarts the clock,
        and on a priority change, which measures from `clock_started_at` so time
        already spent waiting is not handed back.
        """
        return (
            start + timedelta(minutes=self.response_minutes),
            start + timedelta(minutes=self.resolution_minutes),
        )

    @classmethod
    def default(cls):
        """The priority a ticket opens at — lowest rank, i.e. Low.

        Raises if no priorities are seeded: a ticket cannot exist without one.
        """
        priority = cls.objects.order_by("rank").first()
        if priority is None:
            raise RuntimeError(
                "No Priority rows exist — seed the SLA reference data first."
            )
        return priority
