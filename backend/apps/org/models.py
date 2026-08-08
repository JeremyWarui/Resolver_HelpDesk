from django.db import models
from django.conf import settings


class Campus(models.Model):
    """Physical campus or branch — standalone, not scoped to an Organisation."""

    name = models.CharField(max_length=200, unique=True)
    code = models.CharField(max_length=10, unique=True)  # e.g. "NRB", "MSA"
    location = models.CharField(max_length=200, blank=True)

    class Meta:
        app_label = "org"
        ordering = ["name"]
        verbose_name_plural = "Campuses"

    def __str__(self):
        return f"{self.code}: {self.name}"


class Department(models.Model):
    """Global functional division — one canonical record per department type.

    A Department exists once in the system and is present at one or more
    campuses via `CampusDepartment`. The optional `manager_user` is the
    organisation-wide manager (not campus-specific; campus HODs live on
    `CampusDepartment.head_of_department`).
    """

    name = models.CharField(max_length=200, unique=True)
    # e.g. "ICT", "HR", "ADM"
    code = models.CharField(max_length=10, unique=True)
    manager_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_departments",
    )

    class Meta:
        app_label = "org"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["name"], name="unique_department_name"),
            models.UniqueConstraint(fields=["code"], name="unique_department_code"),
        ]

    def __str__(self):
        return f"{self.code}: {self.name}"


class CampusDepartment(models.Model):
    """Operational mapping between a `Campus` and a global `Department`.

    Each CampusDepartment represents the presence of a global Department at
    a particular Campus and ties to the campus-level HOD user.
    """

    campus = models.ForeignKey(
        Campus, on_delete=models.CASCADE, related_name="campus_departments"
    )
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, related_name="campus_departments"
    )
    head_of_department = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="headed_campus_departments",
    )

    class Meta:
        app_label = "org"
        ordering = ["campus", "department"]
        constraints = [
            models.UniqueConstraint(
                fields=["campus", "department"],
                name="unique_campus_department",
            )
        ]

    def __str__(self):
        return f"{self.campus.code} – {self.department.code}"


class SectionType(models.Model):
    """Blueprint for a type of section that can exist within a Department.

    SectionType is organisation-wide (not campus-specific). Each Department
    can define multiple SectionTypes (e.g. ICT → "Software", "Networks").
    Actual campus-level sections are created as `Section` instances that
    reference both a `CampusDepartment` and a `SectionType`.
    """

    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name="section_types",
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)

    class Meta:
        app_label = "org"
        ordering = ["department", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["department", "name"],
                name="unique_section_type_per_department",
            )
        ]

    def __str__(self):
        return f"{self.department.code}-{self.code}: {self.name}"


class SubSection(models.Model):
    """A trade within a SectionType — Carpentry, Masonry, Painting, Plumbing, Electrical.

    Global, like its parent SectionType: a sub-section is defined once and is
    available at every campus that runs the section type. A campus that does no
    masonry simply has no masonry technicians. Campus specificity lives on
    `Section`, so `(Section, SubSection)` is the pair that identifies a trade at
    a campus — see `SectionTechnician`.

    `location_details` gates the location step of the ticket wizard. Priority is
    deliberately absent: it is not a property of the service, it is a judgement
    the HOS makes about a specific ticket when they assign it.
    """

    section_type = models.ForeignKey(
        SectionType,
        on_delete=models.CASCADE,
        related_name="sub_sections",
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    location_details = models.BooleanField(
        default=False,
        help_text="Whether the ticket creation wizard should collect location information.",
    )

    class Meta:
        app_label = "org"
        ordering = ["section_type", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["section_type", "name"],
                name="unique_sub_section_name_per_section_type",
            ),
            models.UniqueConstraint(
                fields=["section_type", "code"],
                name="unique_sub_section_code_per_section_type",
            ),
        ]

    def __str__(self):
        return f"{self.section_type.code}-{self.code}: {self.name}"


class ServiceItem(models.Model):
    """A specific, requestable service within a SubSection.

    Picking one of these is the only routing decision a requester makes; the
    section and sub-section are derived from it server-side. Priority is not —
    every ticket opens at the default and the HOS sets it at assignment.
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


class Section(models.Model):
    """A campus-specific instance of a SectionType under a CampusDepartment.

    R2: section_type.department must equal campus_department.department.
    R3: (campus_department, section_type) is unique.
    """

    from django.core.exceptions import ValidationError

    campus_department = models.ForeignKey(
        CampusDepartment,
        on_delete=models.CASCADE,
        related_name="sections",
    )
    section_type = models.ForeignKey(
        SectionType,
        on_delete=models.CASCADE,
        related_name="sections",
    )
    hos = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="headed_sections",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        app_label = "org"
        ordering = ["campus_department", "section_type"]
        constraints = [
            models.UniqueConstraint(
                fields=["campus_department", "section_type"],
                name="unique_section_per_campus_department_type",
            )
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        """R2: section_type.department must equal campus_department.department."""
        if (
            self.section_type_id
            and self.campus_department_id
            and self.section_type.department_id != self.campus_department.department_id
        ):
            raise ValidationError(
                "section_type.department must match campus_department.department (R2)."
            )

    def __str__(self):
        campus = self.campus_department.campus.code
        dept = self.campus_department.department.code
        stype = self.section_type.code
        return f"{campus}-{dept}-{stype}"

    @property
    def campus(self):
        return self.campus_department.campus


class SectionTechnician(models.Model):
    """Links a technician to a specific trade at a specific campus.

    One row is one `(campus, trade)` pair, because `section` already carries the
    campus (NRB-ADM-MAINT and MSA-ADM-MAINT are distinct rows). A technician may
    hold several rows; scope is the set of pairs, never the cross product of the
    sections and sub-sections they appear in — see `scoped_ticket_qs`.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="technician_section_links",
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.CASCADE,
        related_name="technician_links",
    )
    sub_section = models.ForeignKey(
        SubSection,
        on_delete=models.CASCADE,
        related_name="technician_links",
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "org"
        ordering = ["section", "sub_section", "user"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "section", "sub_section"],
                name="unique_technician_section_sub_section",
            )
        ]
        indexes = [
            models.Index(
                fields=["section", "sub_section"],
                name="sectech_section_sub_idx",
            ),
        ]

    def clean(self):
        """The trade must belong to the section's type — no Plumbing row on an ICT section."""
        from django.core.exceptions import ValidationError

        if (
            self.section_id
            and self.sub_section_id
            and self.sub_section.section_type_id != self.section.section_type_id
        ):
            raise ValidationError(
                {"sub_section": "sub_section must belong to the section's section_type."}
            )

    def __str__(self):
        return f"{self.user.username} → {self.section}/{self.sub_section.code}"
