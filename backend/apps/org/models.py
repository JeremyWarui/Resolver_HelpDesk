"""
The campuses, the trades, and the service catalogue hung off them.

A campus is the whole organisational tree: this is the Maintenance section of
one department, so a department, a section type and a section per campus would
each carry exactly one value and encode nothing the campus does not already
say. Structure only — nothing here points at a user.
"""

from django.db import models


class Campus(models.Model):
    """A physical campus or branch. The unit every scope rule is drawn on."""

    name = models.CharField(max_length=200, unique=True)
    code = models.CharField(max_length=10, unique=True)  # e.g. "NRB", "MSA"
    location = models.CharField(max_length=200, blank=True)

    class Meta:
        app_label = "org"
        ordering = ["name"]
        verbose_name_plural = "Campuses"

    def __str__(self):
        return f"{self.code}: {self.name}"


class SubSection(models.Model):
    """A trade: Carpentry, Masonry, Painting, Plumbing, Electrical.

    Global, not per-campus. Every campus runs Maintenance and every campus
    fields all five trades, so a per-campus trade table would hold the same
    five rows five times.
    """

    # No priority field: priority is a judgement about one ticket, not a trade.
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        app_label = "org"
        ordering = ["name"]

    def __str__(self):
        return f"{self.code}: {self.name}"


class ServiceItem(models.Model):
    """A requestable service within a trade.

    Picking one is the only routing decision a requester makes; the trade is
    derived from it server-side, and the campus from the requester.
    """

    sub_section = models.ForeignKey(
        SubSection,
        on_delete=models.CASCADE,
        related_name="service_items",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        app_label = "org"
        ordering = ["sub_section", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["sub_section", "name"],
                name="unique_service_item_per_sub_section",
            )
        ]

    def __str__(self):
        return f"{self.sub_section.name} → {self.name}"
