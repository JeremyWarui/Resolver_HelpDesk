"""
Structure only: no row here points at a user.

Campus is the whole tree: there is one department and one Maintenance section
per campus, so neither has a table.
"""

from django.db import models


class Campus(models.Model):
    """The unit every scope rule is drawn on."""

    name = models.CharField(max_length=200, unique=True)
    code = models.CharField(max_length=10, unique=True)  # e.g. "NRB", "MSA"
    location = models.CharField(max_length=200, blank=True)

    class Meta:
        app_label = "org"
        ordering = ["name"]
        verbose_name_plural = "Campuses"

    def __str__(self):
        return f"{self.code}: {self.name}"


class Trade(models.Model):
    """Carpentry, Masonry, Painting, Plumbing, Electrical.

    Global: all five run at every campus.
    """

    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        app_label = "org"
        ordering = ["name"]

    def __str__(self):
        return f"{self.code}: {self.name}"


class ServiceItem(models.Model):
    """The only routing decision a requester makes.
    Trade is derived from the item server-side, campus from the requester.
    """

    trade = models.ForeignKey(
        Trade,
        on_delete=models.CASCADE,
        related_name="service_items",
    )
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)

    class Meta:
        app_label = "org"
        ordering = ["trade", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["trade", "name"],
                name="unique_service_item_per_trade",
            )
        ]

    def __str__(self):
        return f"{self.trade.name} → {self.name}"
