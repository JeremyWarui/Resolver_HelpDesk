"""The facility registry: a type, and the named places of that type at a campus."""

from django.db import models

# The facility types the system ships with, as code -> display name. Both
# `seed` and the test factories create their rows from this one table.
FACILITY_TYPES = {
    "office_block": "Office Block",
    "hostel": "Hostel",
    "building": "Building",
    "residential": "Staff Quarters",
    "equipment": "Equipment",
    "grounds": "Grounds / Field",
}


class FacilityType(models.Model):
    """A kind of facility, used to group the register (e.g. office_block, hostel)."""

    name = models.CharField(max_length=80, unique=True)
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
