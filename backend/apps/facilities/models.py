"""The facility registry: a type, and the named places of that type at a campus."""

from django.db import models


class FacilityType(models.Model):
    """A small, fixed enumeration of facility kinds (e.g. office_block, building).

    The rows mirror `facilities.validators.TYPE_SPECS`, which declares the set
    and the location form each type maps to on the frontend. Seed reads it; add
    a type there, not here.
    """

    name = models.CharField(max_length=80, unique=True)
    # Stable key: picks the location form, and keys into TYPE_SPECS.
    code = models.CharField(max_length=20, unique=True)

    class Meta:
        app_label = "facilities"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Facility(models.Model):
    """A physical building or place on a campus; drives the location dropdown."""

    campus = models.ForeignKey(
        "org.Campus",
        on_delete=models.CASCADE,
        related_name="facilities",
    )
    facility_type = models.ForeignKey(
        FacilityType,
        on_delete=models.PROTECT,
        related_name="facilities",
    )
    name = models.CharField(max_length=160)

    class Meta:
        app_label = "facilities"
        ordering = ["campus", "name"]
        verbose_name_plural = "Facilities"
        constraints = [
            # (campus, name) is the natural key: every campus has an
            # "Administration Block".
            models.UniqueConstraint(
                fields=["campus", "name"], name="unique_facility_per_campus"
            ),
        ]

    def __str__(self):
        return f"{self.campus} – {self.name}"
