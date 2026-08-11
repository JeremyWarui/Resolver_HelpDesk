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
from collections import defaultdict
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import RoleAssignment, UserProfile
from apps.facilities.models import Facility, FacilityType
from apps.facilities.validators import TYPE_SPECS
from apps.tickets.pending_reasons import PENDING_REASON_LABELS

# What a technician would actually have typed, per reason — so the demo shows
# the note carrying information the code cannot ("which part", "whose
# approval"), which is the whole argument for keeping both.
PENDING_NOTES = {
    "awaiting_materials": "Replacement parts not in the store.",
    "awaiting_procurement": "LPO raised — supplier has not delivered.",
    "awaiting_approval": "Above section limit — with the HOD.",
    "awaiting_labour": "No plumber free on this campus this week.",
    "awaiting_contractor": "Lift contractor booked for the next site visit.",
    "awaiting_requester": "Occupant to confirm a time we can work.",
    "access_unavailable": "Room in use — rescheduled with the occupant.",
    "scope_clarification": "Extent of works unclear, site meeting needed.",
}
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
# Six, matching apps.facilities.validators.TYPE_SPECS. Conference facilities,
# dining halls and recreational blocks are all `building`: the register names
# them, and none of them has an interior form of its own.
FACILITY_TYPES = [
    ("Office Block", "office_block"),
    ("Hostel", "hostel"),
    ("Building", "building"),
    ("Staff Quarters", "residential"),
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



def demo_age_minutes(rng):
    """How long ago a demo ticket was raised, weighted toward recent.

    Spread evenly over 90 days, two thirds of the data sat outside the 30-day
    window every analytics page opens on — so the ticket list said 170 and the
    dashboard said 51, and nobody could tell which number was wrong. Meanwhile
    `open_backlog` is a live count and ignores the window entirely, so the same
    screen mixed windowed and unwindowed figures.

    Real desks are denser in the recent past: this month's work is still being
    raised, last quarter's is mostly closed. Weighting the draw makes the
    default view representative and still leaves a tail for the trend line.
    """
    band = rng.choices(
        [(0, 30), (30, 60), (60, DEMO_WINDOW_DAYS)],
        weights=[65, 23, 12],
    )[0]
    low, high = band
    return rng.randint(max(low * 24 * 60, 30), high * 24 * 60)

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
        ("Conference Center", "building", "NRB-CONF"),
        ("Maasai Mara", "building", "NRB-MM"),
        ("Gate House", "building", "NRB-GH"),
        ("Margaret Kobia", "hostel", "NRB-MK"),
        ("Gateere", "hostel", "NRB-GTR"),
        ("Wamalwa", "hostel", "NRB-WMW"),
        ("Sawe", "hostel", "NRB-SAWE"),
        ("Mekatilili", "hostel", "NRB-MEK"),
        ("Kamoche", "building", "NRB-KAM"),
        ("Maandalizi", "building", "NRB-MAAN"),
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
        ("Dining Hall", "building", "MTG-DIN"),
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
        ("Kipsunya", "building", "BAR-KIP"),
        ("Koilagen", "building", "BAR-KOI"),
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
# A demo has to be big enough to have a shape. At 45 tickets over 14 days every
# chart was a handful of short bars, most facilities tied on two tickets each,
# and the 30-day analytics default — the one every role opens on — saw barely
# half the data. Three months is also what makes a trend line mean anything.
DEMO_TICKET_COUNT = 150
DEMO_WINDOW_DAYS = 90

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
    "hostel": lambda r: {"room_number": f"{r.choice('ABC')}-{r.randint(101, 320)}"},
    "building": lambda r: {"area": r.choice(["Main hall", "Servery", "Ground floor", "Rear wing", "Entrance"])},
    "residential": lambda r: {
        "tenant_name": r.choice(["J. Mwangi", "A. Chepkoech", "S. Omondi", "M. Wairimu"]),
        "unit_number": f"Q{r.randint(1, 24)}",
    },
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
                self._run_escalations()

        self.stdout.write(self.style.SUCCESS("Seed complete."))

    def _run_escalations(self):
        """Let the escalation engine act on the demo data it just inherited.

        Escalation is automatic: a ticket whose active time passes its
        priority's threshold climbs technician → HOS → HOD. Nothing in the seed
        triggered it, so `current_level` was "technician" on every row and the
        HOS and HOD escalation pages, the escalated counts in every breakdown,
        and the escalation-rate KPI were all empty on a database full of tickets
        that were weeks overdue.

        This runs the real engine rather than stamping levels by hand, so the
        demo shows what production would actually have done.
        """
        from apps.sla.services.escalation import run_escalations

        count = run_escalations()
        self.stdout.write(f"  Escalations: {count} ticket(s) raised above the technician")

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
                defaults={"code": code},
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

    _phone_counter = 0

    def _next_phone(self):
        """A distinct, obviously-fake Kenyan mobile per seeded account, in E.164."""
        self._phone_counter += 1
        return f"+2547{self._phone_counter:08d}"

    def _make_user(self, username, first, last, password, campus=None):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "first_name": first,
                "last_name": last,
                "email": f"{username}@ksg.ac.ke",
                "phone_number": self._next_phone(),
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

        # Technicians who work more than one trade. `SectionTechnician` has
        # always allowed it — the row is a (campus, trade) pair and a person may
        # hold several — but with a single example in the data the work-mix
        # report showed every technician at 100% of one craft, which is the one
        # shape it exists to disprove.
        multi_trade = [
            ("NRB", "tech.nrb.finish", "Anthony", "Gitau", ("CARP", "PAINT")),
            ("MSA", "tech.msa.multi", "Grace", "Achieng", ("PLUMB", "ELEC")),
            ("EMB", "tech.emb.multi", "Daniel", "Kiptoo", ("MAS", "PLUMB", "PAINT")),
        ]
        for campus_code, username, first, last, trade_codes in multi_trade:
            section = sections[campus_code]
            user = self._make_user(
                username, first, last, password, section.campus_department.campus
            )
            self._set_role(user, "technician", section=section)
            for trade_code in trade_codes:
                SectionTechnician.objects.get_or_create(
                    user=user, section=section, sub_section=sub_sections[trade_code]
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
        # Every technician linked to the pair, not one of them. This was a dict
        # keyed on (section, sub_section), so it silently kept whichever row
        # came last — a multi-trade technician could never receive work in the
        # trade whose link lost the race, and the work-mix chart could only ever
        # show single-trade people.
        technicians = defaultdict(list)
        for link in SectionTechnician.objects.select_related("user"):
            technicians[(link.section_id, link.sub_section_id)].append(link.user)

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
        for index in range(DEMO_TICKET_COUNT):
            # Every sixth ticket lands in an unstaffed trade, so the "routed but
            # nobody to assign" state is visible without swamping the data.
            pool = unstaffed_pairs if index % 6 == 5 and unstaffed_pairs else staffed_pairs
            campus_code, trade_code = rng.choice(pool)
            section = sections[campus_code]
            sub_section = sub_sections[trade_code]
            requester = rng.choice(requesters)
            item = rng.choice(items_by_trade[trade_code])
            status = rng.choice(statuses)

            candidates = technicians.get((section.id, sub_section.id)) or []
            technician = rng.choice(candidates) if candidates else None
            if technician is None:
                # Nobody works this trade at this campus, so it can only sit
                # open — exactly the gap TRADE_STAFFING is meant to show.
                status = "open"

            age_minutes = demo_age_minutes(rng)
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
                contact_phone=requester.phone_number,
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

        created += self._seed_chronic_faults(
            sections, sub_sections, requesters, priorities, technicians,
            facilities_by_campus, items_by_trade, rng, now,
        )
        self.stdout.write(
            f"  Demo tickets: {created} over the last {DEMO_WINDOW_DAYS} days"
        )

    def _seed_chronic_faults(
        self, sections, sub_sections, requesters, priorities, technicians,
        facilities_by_campus, items_by_trade, rng, now,
    ):
        """A handful of buildings with the same fault, over and over.

        `insights._recurring_fault` looks for a (facility, service_item) pair
        raised three times or more, and it is the single most actionable thing
        the analytics layer produces — "this is a permanent fix, not a repeated
        patch". Against uniformly random demo data it returned nothing, every
        run, so the feature looked broken rather than quiet.

        Real estates behave this way: one hostel's drainage, one block's
        wiring. Concentrating a slice of the data reproduces that rather than
        inventing it.
        """
        chronic = [
            ("NRB", "PLUMB", "Blocked toilet, sink or drain", "Margaret Kobia"),
            ("MTG", "PLUMB", "Blocked toilet, sink or drain", "Kitchen"),
            ("EMB", "ELEC", "Lighting fault", "Kiambere"),
            ("NRB", "CARP", "Replace lock or hinges", "Wamalwa"),
            ("MSA", "MAS", "Repair cracked wall", "Ultra Modern"),
        ]
        created = 0
        for campus_code, trade_code, item_name, facility_name in chronic:
            section = sections[campus_code]
            sub_section = sub_sections[trade_code]
            item = next(
                (i for i in items_by_trade[trade_code] if i.name == item_name), None
            )
            facility = next(
                (f for f in facilities_by_campus[campus_code] if f.name == facility_name),
                None,
            )
            if item is None or facility is None:
                continue

            candidates = technicians.get((section.id, sub_section.id)) or []
            for _ in range(rng.randint(3, 5)):
                requester = rng.choice(requesters)
                # Chronic faults are mostly closed out and then recur — that is
                # what makes them chronic rather than simply unresolved.
                status = rng.choice(["closed", "closed", "resolved", "in_progress", "open"])
                technician = rng.choice(candidates) if candidates else None
                if technician is None:
                    status = "open"
                priority = priorities["Low"] if status == "open" else rng.choice(
                    [priorities["Low"], priorities["Medium"], priorities["High"]]
                )
                created_at = now - timedelta(minutes=demo_age_minutes(rng))
                ticket = Ticket.objects.create(
                    raised_by=requester,
                    requester_campus=section.campus_department.campus,
                    service_item=item,
                    section=section,
                    sub_section=sub_section,
                    priority=priority,
                    assigned_to=None if status == "open" else technician,
                    description=f"{item.name} reported at {facility.name}.",
                    contact_phone=requester.phone_number,
                    status=status,
                    response_due_at=created_at + timedelta(minutes=priority.response_minutes),
                    resolution_due_at=created_at + timedelta(minutes=priority.resolution_minutes),
                )
                Ticket.objects.filter(pk=ticket.pk).update(created_at=created_at)
                ticket.refresh_from_db()
                builder = LOCATION_VALUES.get(facility.facility_type.code)
                TicketLocation.objects.create(
                    ticket=ticket,
                    facility_type=facility.facility_type,
                    facility=facility,
                    values=builder(rng) if builder else {},
                )
                self._write_history(ticket, technician, created_at, rng)
                created += 1
        return created

    def _attach_location(self, ticket, facilities, rng):
        """Every ticket says where it is — there is no branch that leaves one
        without a location.

        Most of the time that is a named facility off the register. Every
        fourth ticket instead uses one of the types the register does not name
        — a staff house or a piece of equipment — so the demo data exercises
        both shapes of location rather than only the dropdown one.
        """
        # Grounds is left out: it has facility rows on the register (Field, Gas
        # Point) and so already turns up through the branch below. These two
        # have none, and would otherwise never appear in the demo data at all.
        unnamed = ["residential", "equipment"]
        if facilities and rng.random() > 0.25:
            # Weighted, not uniform. Spread evenly across a campus's register
            # every building landed on two or three tickets, so the facility
            # chart was a row of equal stubs and "which building is costing us"
            # had no answer. Estates are lopsided — an old block generates most
            # of the faults — and the weighting reproduces that shape.
            weights = [4 if i < 2 else 2 if i < 5 else 1 for i in range(len(facilities))]
            facility = rng.choices(facilities, weights=weights)[0]
            facility_type, type_code = facility.facility_type, facility.facility_type.code
        else:
            facility = None
            type_code = rng.choice(unnamed)
            facility_type = FacilityType.objects.get(code=type_code)

        builder = LOCATION_VALUES.get(type_code)
        TicketLocation.objects.create(
            ticket=ticket,
            facility_type=facility_type,
            facility=facility,
            values=builder(rng) if builder else {},
        )

    @staticmethod
    def _log(ticket, when, **fields):
        """Write a TicketLog stamped `when` rather than now.

        `created_at` is auto_now_add, so a plain create() stamps every log with
        the moment the seed ran. That broke two things at once: response SLA is
        measured from the first action log against `response_due_at`, so every
        demo ticket missed it (0% everywhere, for all roles), and each ticket's
        timeline showed its whole life happening in the same second.
        """
        log = TicketLog.objects.create(ticket=ticket, **fields)
        TicketLog.objects.filter(pk=log.pk).update(created_at=when)
        return log

    def _write_history(self, ticket, technician, created_at, rng):
        """Give each ticket a log trail consistent with the status it landed on."""
        self._log(
            ticket, created_at, event_type="created",
            actor=ticket.raised_by, to_value=ticket.ticket_no,
        )
        if ticket.status == "open":
            return

        # Picked up well inside the response window most of the time — the same
        # shape as resolution below, so response SLA means something.
        response_window = timedelta(minutes=ticket.priority.response_minutes)
        if rng.random() < 0.85:
            assigned_at = created_at + response_window * rng.uniform(0.1, 0.9)
        else:
            assigned_at = created_at + response_window * rng.uniform(1.2, 3.0)
        self._log(
            ticket, assigned_at, event_type="assigned", actor=None,
            to_value=technician.get_full_name() if technician else "",
        )
        started_at = assigned_at + timedelta(minutes=rng.randint(5, 240))
        if ticket.status in ("in_progress", "pending", "resolved", "closed"):
            self._log(
                ticket, started_at, event_type="status_changed", actor=technician,
                from_value="assigned", to_value="in_progress",
            )
        if ticket.status == "pending":
            # Weighted, not uniform: a maintenance section is stopped by parts
            # and money far more often than by anything else, and a flat draw
            # would show six equal bars — a chart that renders and tells the
            # reader nothing. `other` is left out entirely; it is the bucket
            # that means "we failed to categorise this", not a real cause.
            reason = rng.choices(list(PENDING_NOTES), weights=[26, 20, 15, 12, 10, 8, 5, 4])[0]
            paused_at = created_at + timedelta(hours=rng.randint(1, 12))
            Ticket.objects.filter(pk=ticket.pk).update(
                paused_at=paused_at,
                pending_reason=reason,
                pending_reason_note=PENDING_NOTES[reason],
            )
            self._log(
                ticket, paused_at, event_type="status_changed", actor=technician,
                from_value="in_progress", to_value="pending",
                reason=f"{PENDING_REASON_LABELS[reason]} — {PENDING_NOTES[reason]}",
            )
        if ticket.status in ("resolved", "closed"):
            # Resolution time is drawn relative to the ticket's own SLA window,
            # not from a flat 2–72 hours. The flat draw ignored priority, so a
            # Critical ticket (2h to resolve) almost always missed — across the
            # whole seed only 7% of resolved tickets met their deadline, every
            # gauge showed 0%, and a genuine SLA regression would have been
            # indistinguishable from the demo data.
            #
            # Most work lands inside the window; a realistic minority runs over.
            window = timedelta(minutes=ticket.priority.resolution_minutes)
            if rng.random() < 0.78:
                resolved_at = created_at + window * rng.uniform(0.2, 0.95)
            else:
                resolved_at = created_at + window * rng.uniform(1.1, 2.5)
            Ticket.objects.filter(pk=ticket.pk).update(resolved_at=resolved_at)
            self._log(
                ticket, resolved_at, event_type="resolved", actor=technician,
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
            # The requester confirms some time after the fix — always after
            # `resolved_at`, which the flat 73–120h draw did not guarantee once
            # resolution became SLA-relative (a Critical ticket resolves in
            # under two hours).
            closed_at = resolved_at + timedelta(hours=rng.randint(2, 48))
            Ticket.objects.filter(pk=ticket.pk).update(closed_at=closed_at)
            self._log(
                ticket, closed_at, event_type="closed", actor=ticket.raised_by,
                from_value="resolved", to_value="closed",
            )
            if rng.random() < 0.7:
                TicketFeedback.objects.create(
                    ticket=ticket,
                    rating=rng.choice([3, 4, 4, 5, 5, 5]),
                    comment=rng.choice(["", "", "Quick turnaround, thank you.", "Well handled."]),
                )
