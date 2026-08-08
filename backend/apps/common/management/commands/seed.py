"""Seed the Maintenance Helpdesk.

One command, idempotent throughout (`get_or_create` on natural keys), so it is
safe to re-run against an existing database — it fills gaps rather than
duplicating. Demo tickets are the exception and are skipped entirely if any
already exist, since they have no natural key.

Refuses to run without SEED_DEFAULT_PASSWORD, so a deployment cannot
accidentally acquire a set of accounts with a password from source control.

    SEED_DEFAULT_PASSWORD='…' python manage.py seed
    SEED_DEFAULT_PASSWORD='…' python manage.py seed --no-demo   # structure only
"""

import os
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import RoleAssignment, UserProfile
from apps.facilities.models import Facility, FacilityType
from apps.org.models import (
    Campus,
    CampusDepartment,
    Department,
    Section,
    SectionTechnician,
    SectionType,
    ServiceItem,
    SubSection,
)
from apps.sla.models import EscalationRule, Priority
from apps.tickets.models import Ticket, TicketComment, TicketFeedback, TicketLocation, TicketLog

User = get_user_model()


# ── Reference data ────────────────────────────────────────────────────────────

# (name, code) — code must have a matching entry in facilities.validators.TYPE_SPECS
FACILITY_TYPES = [
    ("Office Block", "office_block"),
    ("Conference Facility", "conference_facility"),
    ("Hostel", "hostel"),
    ("Staff Quarters", "residential"),
    ("Dining", "dining"),
    ("Recreational", "recreational"),
    ("Building", "building"),
    ("Equipment", "equipment"),
    ("Grounds / Field", "grounds"),
]

# (name, rank, response_minutes, resolution_minutes)
# Rank 1 is what a ticket opens at — Priority.default() orders by rank.
PRIORITIES = [
    ("Low", 1, 480, 4320),      # 8h response, 3d resolution
    ("Medium", 2, 240, 1440),   # 4h response, 1d resolution
    ("High", 3, 60, 480),       # 1h response, 8h resolution
    ("Critical", 4, 30, 120),   # 30m response, 2h resolution
]

# (priority_name, to_level, threshold_minutes, order)
ESCALATION_RULES = [
    ("Low", "hos", 2880, 1),
    ("Low", "hod", 5760, 2),
    ("Medium", "hos", 720, 1),
    ("Medium", "hod", 1440, 2),
    ("High", "hos", 240, 1),
    ("High", "hod", 480, 2),
    ("Critical", "hos", 60, 1),
    ("Critical", "hod", 120, 2),
]


# ── Org ───────────────────────────────────────────────────────────────────────

CAMPUSES = [
    ("Nairobi", "NRB", "Lower Kabete"),
    ("Mombasa", "MSA", "Mombasa"),
    ("Matuga", "MTG", "Kwale"),
    ("Embu", "EMB", "Embu"),
    ("Baringo", "BAR", "Kabarnet"),
]

DEPARTMENT = ("Administration", "ADM")
SECTION_TYPE = ("Maintenance", "MTCE")

# (name, code) — global trades, available at every campus running Maintenance.
SUB_SECTIONS = [
    ("Carpentry", "CARP"),
    ("Masonry", "MAS"),
    ("Painting", "PAINT"),
    ("Plumbing", "PLUMB"),
    ("Electrical", "ELEC"),
]

SERVICE_ITEMS = {
    "CARP": [
        "Repair door or door frame",
        "Replace lock or hinges",
        "Repair furniture",
        "Fit or repair shelving",
        "Repair window frame",
        "Ceiling board repair",
    ],
    "MAS": [
        "Repair cracked wall",
        "Repair floor or tiles",
        "Repair paving or walkway",
        "Repair drainage channel",
        "Plaster repair",
    ],
    "PAINT": [
        "Repaint room",
        "Touch-up paint",
        "Repaint exterior wall",
        "Varnish woodwork",
        "Remove graffiti or stains",
    ],
    "PLUMB": [
        "Leaking tap or pipe",
        "Blocked toilet, sink or drain",
        "Faulty cistern",
        "Water heater fault",
        "No water supply",
        "Burst pipe",
    ],
    "ELEC": [
        "Faulty socket or switch",
        "Lighting fault",
        "Power outage in room",
        "Faulty air conditioner",
        "Generator fault",
        "Faulty appliance",
    ],
}


# ── Facilities ────────────────────────────────────────────────────────────────

# campus_code → [(name, facility_type_code, facility_code)]
FACILITIES = {
    "NRB": [
        ("Habel Nyamu Library", "office_block", "NRB-HNL"),
        ("Administration Block", "office_block", "NRB-ADMIN"),
        ("Convention Center", "office_block", "NRB-CC"),
        ("eLITI", "office_block", "NRB-ELITI"),
        ("Conference Center", "conference_facility", "NRB-CONF"),
        ("Maasai Mara", "conference_facility", "NRB-MM"),
        ("Gate House", "building", "NRB-GH"),
        ("Margaret Kobia", "hostel", "NRB-MK"),
        ("Gateere", "hostel", "NRB-GTR"),
        ("Wamalwa", "hostel", "NRB-WMW"),
        ("Sawe", "hostel", "NRB-SAWE"),
        ("Mekatilili", "hostel", "NRB-MEK"),
        ("Kamoche", "recreational", "NRB-KAM"),
        ("Maandalizi", "dining", "NRB-MAAN"),
        ("Gas Point", "grounds", "NRB-GAS"),
        # Office block cum recreational — typed as an office block because
        # floor + room is the more specific ask and still fits the social areas.
        ("Sacho", "office_block", "NRB-SACHO"),
        ("Field", "grounds", "NRB-FIELD"),
        ("Mt. Kenya", "office_block", "NRB-MTK"),
    ],
    "MSA": [
        ("Administration Block", "office_block", "MSA-ADMIN"),
        ("Galana", "hostel", "MSA-GAL"),
        # Hostel + office block + conference facility in one. Typed as a
        # building so the requester names the wing in `area`; split it into
        # three Facility rows if the wings need separate reporting.
        ("Ultra Modern", "building", "MSA-UM"),
    ],
    "MTG": [
        ("Mwalughanje", "hostel", "MTG-MWA"),
        ("Administration Block", "office_block", "MTG-ADMIN"),
        ("Dining Hall", "dining", "MTG-DIN"),
        ("Kitchen", "building", "MTG-KIT"),
        ("Customer Care", "office_block", "MTG-CARE"),
    ],
    "EMB": [
        ("Jumuiya", "hostel", "EMB-JUM"),
        ("Kiambere", "hostel", "EMB-KIA"),
        ("Administration Block", "office_block", "EMB-ADMIN"),
        ("Procurement", "building", "EMB-PROC"),
        ("Gate House", "building", "EMB-GH"),
        ("Kitchen", "building", "EMB-KIT"),
    ],
    "BAR": [
        ("Gate House", "building", "BAR-GH"),
        ("Administration Block", "office_block", "BAR-ADMIN"),
        ("Library", "office_block", "BAR-LIB"),
        ("Kipsunya", "conference_facility", "BAR-KIP"),
        ("Koilagen", "conference_facility", "BAR-KOI"),
    ],
}


# ── People ────────────────────────────────────────────────────────────────────

# campus_code → (hod_first_last, hos_first_last)
SUPERVISORS = {
    "NRB": (("Aisha", "Wanjiru"), ("Peter", "Kimani")),
    "MSA": (("Salim", "Bakari"), ("Grace", "Achieng")),
    "MTG": (("Fatuma", "Mwangome"), ("Daniel", "Otieno")),
    "EMB": (("Njeri", "Muriuki"), ("Samuel", "Njagi")),
    "BAR": (("Cherop", "Kiptoo"), ("Mercy", "Jepkosgei")),
}

# campus_code → trade codes staffed there. Deliberately uneven: a masonry
# ticket at Baringo routes correctly but has nobody to assign it to, which is a
# real state the HOS should be able to see. Give every campus all five if you
# would rather every demo path complete.
TRADE_STAFFING = {
    "NRB": ["CARP", "MAS", "PAINT", "PLUMB", "ELEC"],
    "MSA": ["MAS", "PLUMB", "ELEC"],
    "MTG": ["CARP", "PLUMB", "ELEC"],
    "EMB": ["MAS", "PLUMB", "ELEC"],
    "BAR": ["PLUMB", "ELEC"],
}

TECHNICIAN_NAMES = [
    ("John", "Mutiso"), ("Alice", "Nafula"), ("Brian", "Ochieng"),
    ("Esther", "Wairimu"), ("Kevin", "Barasa"), ("Lydia", "Chebet"),
    ("Moses", "Kariuki"), ("Nancy", "Atieno"), ("Oscar", "Mwendwa"),
    ("Purity", "Nyambura"), ("Robert", "Kiplagat"), ("Sarah", "Adhiambo"),
    ("Tom", "Wekesa"), ("Violet", "Chelimo"), ("Wilson", "Maina"),
    ("Zipporah", "Kilonzo"), ("Amos", "Rotich"), ("Beatrice", "Wangui"),
]

REQUESTER_NAMES = [
    ("Caroline", "Wafula"), ("Dennis", "Kimutai"), ("Eunice", "Mbithe"),
    ("Felix", "Onyango"), ("Gladys", "Chepkemoi"), ("Henry", "Mwaura"),
    ("Irene", "Nduta"), ("James", "Kiprop"), ("Kelvin", "Simiyu"),
    ("Loise", "Wanjala"),
]

# Location values by facility type — mirrors validators.TYPE_SPECS so demo
# tickets carry location data the wizard would actually have produced.
LOCATION_VALUES = {
    "office_block": lambda r: {"floor": str(r.randint(0, 3)), "room": f"{r.randint(1, 4)}{r.randint(10, 40)}"},
    "conference_facility": lambda r: {"area": r.choice(["Main hall", "Breakout room", "Foyer", "AV booth"])},
    "hostel": lambda r: {"room_number": f"{r.choice('ABC')}-{r.randint(101, 320)}"},
    "residential": lambda r: {"unit_number": f"Q{r.randint(1, 24)}"},
    "dining": lambda r: {"area": r.choice(["Servery", "Seating area", "Wash-up", "Store"])},
    "recreational": lambda r: {"area": r.choice(["Gym", "Common room", "Games room", "Terrace"])},
    "building": lambda r: {"area": r.choice(["Ground floor", "First floor", "Rear wing", "Entrance"])},
    "grounds": lambda r: {"zone": r.choice(["North lawn", "Car park", "Perimeter", "Service yard"])},
    "equipment": lambda r: {"asset_name": r.choice(["Standby generator", "Water pump", "Boiler"])},
}


class Command(BaseCommand):
    help = "Seed the Maintenance Helpdesk (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-demo",
            action="store_true",
            help="Seed structure and accounts only — no demo tickets.",
        )

    def handle(self, *args, **options):
        password = os.getenv("SEED_DEFAULT_PASSWORD")
        if not password:
            raise CommandError(
                "SEED_DEFAULT_PASSWORD is not set. Refusing to create accounts "
                "with a password from source control."
            )

        with transaction.atomic():
            self._seed_facility_types()
            priorities = self._seed_priorities()
            self._seed_escalation_rules(priorities)

            campuses = self._seed_campuses()
            department = self._seed_department()
            section_type = self._seed_section_type(department)
            sub_sections = self._seed_sub_sections(section_type)
            self._seed_service_items(sub_sections)
            sections = self._seed_sections(campuses, department, section_type)
            self._seed_facilities(campuses)

            self._seed_admin(password)
            self._seed_director(department, password)
            self._seed_supervisors(campuses, sections, password)
            self._seed_technicians(sections, sub_sections, password)
            requesters = self._seed_requesters(campuses, password)

            if options["no_demo"]:
                self.stdout.write("  Demo tickets: skipped (--no-demo)")
            else:
                self._seed_demo_tickets(sections, sub_sections, requesters, priorities)

        self.stdout.write(self.style.SUCCESS("Seed complete."))

    # ── Reference ─────────────────────────────────────────────────────────────

    def _seed_facility_types(self):
        for name, code in FACILITY_TYPES:
            FacilityType.objects.get_or_create(code=code, defaults={"name": name})
        self.stdout.write(f"  FacilityType: {len(FACILITY_TYPES)}")

    def _seed_priorities(self):
        priorities = {}
        for name, rank, response, resolution in PRIORITIES:
            priorities[name] = Priority.objects.get_or_create(
                rank=rank,
                defaults={
                    "name": name,
                    "response_minutes": response,
                    "resolution_minutes": resolution,
                },
            )[0]
        self.stdout.write(f"  Priority: {len(priorities)} (tickets open at Low)")
        return priorities

    def _seed_escalation_rules(self, priorities):
        for priority_name, to_level, threshold, order in ESCALATION_RULES:
            EscalationRule.objects.get_or_create(
                priority=priorities[priority_name],
                to_level=to_level,
                defaults={"threshold_minutes": threshold, "order": order},
            )
        self.stdout.write(f"  EscalationRule: {len(ESCALATION_RULES)}")

    # ── Org ───────────────────────────────────────────────────────────────────

    def _seed_campuses(self):
        campuses = {}
        for name, code, location in CAMPUSES:
            campuses[code] = Campus.objects.get_or_create(
                code=code, defaults={"name": name, "location": location}
            )[0]
        self.stdout.write(f"  Campus: {len(campuses)}")
        return campuses

    def _seed_department(self):
        name, code = DEPARTMENT
        return Department.objects.get_or_create(code=code, defaults={"name": name})[0]

    def _seed_section_type(self, department):
        name, code = SECTION_TYPE
        return SectionType.objects.get_or_create(
            department=department, name=name, defaults={"code": code}
        )[0]

    def _seed_sub_sections(self, section_type):
        sub_sections = {}
        for name, code in SUB_SECTIONS:
            sub_sections[code] = SubSection.objects.get_or_create(
                section_type=section_type,
                name=name,
                defaults={
                    "code": code,
                    # Every maintenance job has a place, so all five collect a
                    # location. The flag earns its keep for future section
                    # types where that is not true.
                    "location_details": True,
                },
            )[0]
        self.stdout.write(f"  SubSection: {len(sub_sections)}")
        return sub_sections

    def _seed_service_items(self, sub_sections):
        count = 0
        for code, names in SERVICE_ITEMS.items():
            for name in names:
                ServiceItem.objects.get_or_create(
                    sub_section=sub_sections[code], name=name
                )
                count += 1
        self.stdout.write(f"  ServiceItem: {count}")

    def _seed_sections(self, campuses, department, section_type):
        sections = {}
        for code, campus in campuses.items():
            campus_department = CampusDepartment.objects.get_or_create(
                campus=campus, department=department
            )[0]
            sections[code] = Section.objects.get_or_create(
                campus_department=campus_department, section_type=section_type
            )[0]
        self.stdout.write(f"  Section: {len(sections)} (one Maintenance per campus)")
        return sections

    def _seed_facilities(self, campuses):
        types = {ft.code: ft for ft in FacilityType.objects.all()}
        count = 0
        for campus_code, entries in FACILITIES.items():
            for name, type_code, facility_code in entries:
                Facility.objects.get_or_create(
                    campus=campuses[campus_code],
                    name=name,
                    defaults={
                        "code": facility_code,
                        "facility_type": types[type_code],
                    },
                )
                count += 1
        self.stdout.write(f"  Facility: {count}")

    # ── People ────────────────────────────────────────────────────────────────

    def _make_user(self, username, first, last, password, campus=None):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "first_name": first,
                "last_name": last,
                "email": f"{username}@ksg.ac.ke",
            },
        )
        if created:
            user.set_password(password)
            user.save(update_fields=["password"])
        UserProfile.objects.get_or_create(user=user, defaults={"campus": campus})
        return user

    def _set_role(self, user, role, **scope):
        RoleAssignment.objects.get_or_create(user=user, defaults={"role": role, **scope})

    def _seed_admin(self, password):
        user = self._make_user("admin", "System", "Administrator", password)
        if not user.is_staff:
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=["is_staff", "is_superuser"])
        self._set_role(user, "admin")
        self.stdout.write("  admin: 1")

    def _seed_director(self, department, password):
        """The Corporate HOD — manager role, Administration across all campuses."""
        user = self._make_user("director", "Wanjiku", "Kamau", password)
        self._set_role(user, "manager", department=department)
        if department.manager_user_id is None:
            department.manager_user = user
            department.save(update_fields=["manager_user"])
        self.stdout.write("  manager: 1 (director)")

    def _seed_supervisors(self, campuses, sections, password):
        for campus_code, ((hod_first, hod_last), (hos_first, hos_last)) in SUPERVISORS.items():
            campus = campuses[campus_code]
            section = sections[campus_code]
            campus_department = section.campus_department

            hod = self._make_user(
                f"hod.{campus_code.lower()}", hod_first, hod_last, password, campus
            )
            self._set_role(hod, "hod", campus_department=campus_department)
            if campus_department.head_of_department_id is None:
                campus_department.head_of_department = hod
                campus_department.save(update_fields=["head_of_department"])

            hos = self._make_user(
                f"hos.{campus_code.lower()}", hos_first, hos_last, password, campus
            )
            self._set_role(hos, "hos", section=section)
            if section.hos_id is None:
                section.hos = hos
                section.save(update_fields=["hos"])

        self.stdout.write(f"  hod: {len(SUPERVISORS)}   hos: {len(SUPERVISORS)}")

    def _seed_technicians(self, sections, sub_sections, password):
        """One technician per staffed trade, plus a multi-trade finisher at Nairobi.

        The role row alone grants a technician nothing — access comes from the
        SectionTechnician links, which is what pins them to (campus, trade).
        """
        names = iter(TECHNICIAN_NAMES)
        count = 0
        for campus_code, trade_codes in TRADE_STAFFING.items():
            section = sections[campus_code]
            for trade_code in trade_codes:
                try:
                    first, last = next(names)
                except StopIteration:
                    names = iter(TECHNICIAN_NAMES)
                    first, last = next(names)
                username = f"tech.{campus_code.lower()}.{trade_code.lower()}"
                user = self._make_user(
                    username, first, last, password, section.campus_department.campus
                )
                self._set_role(user, "technician", section=section)
                SectionTechnician.objects.get_or_create(
                    user=user, section=section, sub_section=sub_sections[trade_code]
                )
                count += 1

        # A finisher who does both carpentry and painting — two links, one user.
        nrb = sections["NRB"]
        finisher = self._make_user(
            "tech.nrb.finish", "Anthony", "Gitau", password,
            nrb.campus_department.campus,
        )
        self._set_role(finisher, "technician", section=nrb)
        for trade_code in ("CARP", "PAINT"):
            SectionTechnician.objects.get_or_create(
                user=finisher, section=nrb, sub_section=sub_sections[trade_code]
            )
        count += 1

        self.stdout.write(f"  technician: {count}")

    def _seed_requesters(self, campuses, password):
        codes = list(campuses)
        requesters = []
        for index, (first, last) in enumerate(REQUESTER_NAMES):
            campus_code = codes[index % len(codes)]
            user = self._make_user(
                f"staff.{index + 1}", first, last, password, campuses[campus_code]
            )
            self._set_role(user, "user")
            requesters.append(user)
        self.stdout.write(f"  user: {len(requesters)}")
        return requesters

    # ── Demo tickets ──────────────────────────────────────────────────────────

    def _seed_demo_tickets(self, sections, sub_sections, requesters, priorities):
        if Ticket.objects.exists():
            self.stdout.write("  Demo tickets: skipped (tickets already exist)")
            return

        rng = random.Random(20260808)  # deterministic — same demo data every run
        now = timezone.now()
        items_by_trade = {
            code: list(ServiceItem.objects.filter(sub_section=sub))
            for code, sub in sub_sections.items()
        }
        facilities_by_campus = {
            code: list(
                Facility.objects.filter(campus__code=code).select_related("facility_type")
            )
            for code in sections
        }
        technicians = {
            (link.section_id, link.sub_section_id): link.user
            for link in SectionTechnician.objects.select_related("user")
        }

        # (status, weight) — a realistic backlog is mostly settled work with a
        # live tail, not an even spread across the lifecycle.
        status_choices = [
            ("open", 4), ("assigned", 3), ("in_progress", 4),
            ("pending", 2), ("resolved", 5), ("closed", 6),
        ]
        statuses = [s for s, weight in status_choices for _ in range(weight)]

        # Draw mostly from campus/trade pairs that are actually staffed. Picking
        # uniformly across all 25 combinations would land a third of the demo
        # data in unstaffed trades, where it can only sit open — the backlog
        # would read as broken rather than as a staffing gap.
        staffed_pairs = [
            (campus_code, trade_code)
            for campus_code, trade_codes in TRADE_STAFFING.items()
            for trade_code in trade_codes
        ]
        unstaffed_pairs = [
            (campus_code, trade_code)
            for campus_code in sections
            for trade_code in sub_sections
            if (campus_code, trade_code) not in staffed_pairs
        ]

        created = 0
        for index in range(45):
            # Every sixth ticket lands in an unstaffed trade, so the "routed but
            # nobody to assign" state is visible without swamping the data.
            pool = unstaffed_pairs if index % 6 == 5 and unstaffed_pairs else staffed_pairs
            campus_code, trade_code = rng.choice(pool)
            section = sections[campus_code]
            sub_section = sub_sections[trade_code]
            requester = rng.choice(requesters)
            item = rng.choice(items_by_trade[trade_code])
            status = rng.choice(statuses)

            technician = technicians.get((section.id, sub_section.id))
            if technician is None:
                # Nobody works this trade at this campus, so it can only sit
                # open — exactly the gap TRADE_STAFFING is meant to show.
                status = "open"

            age_minutes = rng.randint(30, 14 * 24 * 60)
            created_at = now - timedelta(minutes=age_minutes)
            priority = priorities["Low"] if status == "open" else rng.choice(
                [priorities["Low"], priorities["Medium"],
                 priorities["High"], priorities["Critical"]]
            )

            ticket = Ticket.objects.create(
                raised_by=requester,
                requester_campus=section.campus_department.campus,
                service_item=item,
                section=section,
                sub_section=sub_section,
                priority=priority,
                assigned_to=None if status == "open" else technician,
                description=f"{item.name} reported by {requester.get_full_name()}.",
                status=status,
                response_due_at=created_at + timedelta(minutes=priority.response_minutes),
                resolution_due_at=created_at + timedelta(minutes=priority.resolution_minutes),
            )
            # created_at is auto_now_add; rewrite it so the demo spans two weeks.
            Ticket.objects.filter(pk=ticket.pk).update(created_at=created_at)
            ticket.refresh_from_db()

            self._attach_location(ticket, facilities_by_campus[campus_code], rng)
            self._write_history(ticket, technician, created_at, rng)
            created += 1

        self.stdout.write(f"  Demo tickets: {created} over the last 14 days")

    def _attach_location(self, ticket, facilities, rng):
        if not facilities:
            return
        facility = rng.choice(facilities)
        type_code = facility.facility_type.code
        builder = LOCATION_VALUES.get(type_code)
        TicketLocation.objects.create(
            ticket=ticket,
            facility_type=facility.facility_type,
            facility=facility,
            values=builder(rng) if builder else {},
        )

    def _write_history(self, ticket, technician, created_at, rng):
        """Give each ticket a log trail consistent with the status it landed on."""
        TicketLog.objects.create(
            ticket=ticket, event_type="created",
            actor=ticket.raised_by, to_value=ticket.ticket_no,
        )
        if ticket.status == "open":
            return

        TicketLog.objects.create(
            ticket=ticket, event_type="assigned", actor=None,
            to_value=technician.get_full_name() if technician else "",
        )
        if ticket.status in ("in_progress", "pending", "resolved", "closed"):
            TicketLog.objects.create(
                ticket=ticket, event_type="status_changed", actor=technician,
                from_value="assigned", to_value="in_progress",
            )
        if ticket.status == "pending":
            Ticket.objects.filter(pk=ticket.pk).update(
                paused_at=created_at + timedelta(hours=rng.randint(1, 12))
            )
        if ticket.status in ("resolved", "closed"):
            resolved_at = created_at + timedelta(hours=rng.randint(2, 72))
            Ticket.objects.filter(pk=ticket.pk).update(resolved_at=resolved_at)
            TicketLog.objects.create(
                ticket=ticket, event_type="resolved", actor=technician,
                from_value="in_progress", to_value="resolved",
            )
            TicketComment.objects.create(
                ticket=ticket, author=technician,
                body=rng.choice([
                    "Fault traced and repaired. Tested and working.",
                    "Parts replaced, area cleaned up.",
                    "Repaired on site — no further action needed.",
                ]),
            )
        if ticket.status == "closed":
            closed_at = created_at + timedelta(hours=rng.randint(73, 120))
            Ticket.objects.filter(pk=ticket.pk).update(closed_at=closed_at)
            TicketLog.objects.create(
                ticket=ticket, event_type="closed", actor=ticket.raised_by,
                from_value="resolved", to_value="closed",
            )
            if rng.random() < 0.7:
                TicketFeedback.objects.create(
                    ticket=ticket,
                    rating=rng.choice([3, 4, 4, 5, 5, 5]),
                    comment=rng.choice(["", "", "Quick turnaround, thank you.", "Well handled."]),
                )
