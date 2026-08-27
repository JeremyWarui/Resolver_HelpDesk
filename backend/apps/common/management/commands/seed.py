"""Seed the Maintenance Helpdesk. Idempotent on natural keys; demo tickets are
skipped entirely if any already exist.

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

from apps.accounts.identity import display_name, local_part
from apps.accounts.models import TechnicianTrade
from apps.accounts.posts import assign_role
from apps.facilities.models import Facility, FacilityType
from apps.facilities.validators import TYPE_SPECS
from apps.org.models import Campus, ServiceItem, Trade
from apps.sla.models import PRIORITY_LEVELS, Priority
from apps.tickets.constants import (
    ALL_STATUSES,
    PENDING_REASON_CODES,
    PENDING_REASON_LABELS,
    TERMINAL_STATUSES,
)
from apps.tickets.models import Ticket, TicketComment, TicketLog
from apps.tickets.phone import normalise_phone

User = get_user_model()

PENDING_NOTES = {
    "material_not_in_store": "Replacement parts not in the store.",
    "awaiting_material_requested": "LPO raised — supplier has not delivered.",
    "requester_unavailable": "Occupant to confirm a time we can work.",
    "location_inaccessible": "Room in use — rescheduled with the occupant.",
    "additional_labour_required": "Needs a second pair of hands to lift out.",
    "technical_assistance_required": "Beyond the section — specialist booked.",
}


def demo_age_minutes(rng):
    """How long ago a demo ticket was raised, weighted toward recent.

    Spread evenly over 90 days, two thirds of the data would sit outside the
    30-day window the analytics pages open on. Real desks are denser in the
    recent past, so weighting the draw makes the default view representative
    and still leaves a tail for the trend line.
    """
    band = rng.choices(
        [(0, 30), (30, 60), (60, DEMO_WINDOW_DAYS)],
        weights=[65, 23, 12],
    )[0]
    low, high = band
    return rng.randint(max(low * 24 * 60, 30), high * 24 * 60)


CAMPUSES = [
    ("Nairobi", "NRB", "Lower Kabete"),
    ("Mombasa", "MSA", "Mombasa"),
    ("Matuga", "MTG", "Kwale"),
    ("Embu", "EMB", "Embu"),
    ("Baringo", "BAR", "Kabarnet"),
]

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


# campus_code → [(name, facility_type_code, facility_code)]
FACILITIES = {
    "NRB": [
        ("Staff Quarters A", "residential", "NRB-SQA"),
        ("Staff Quarters B", "residential", "NRB-SQB"),
        ("Standby Generator", "equipment", "NRB-GEN"),
        ("Borehole Pump", "equipment", "NRB-PUMP"),
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
        ("Sacho", "office_block", "NRB-SACHO"),
        ("Field", "grounds", "NRB-FIELD"),
        ("Mt. Kenya", "office_block", "NRB-MTK"),
    ],
    "MSA": [
        ("Car Park", "grounds", "MSA-PARK"),
        ("Staff Quarters", "residential", "MSA-SQ"),
        ("Standby Generator", "equipment", "MSA-GEN"),
        ("Water Pump", "equipment", "MSA-PUMP"),
        ("Administration Block", "office_block", "MSA-ADMIN"),
        ("Galana", "hostel", "MSA-GAL"),
        ("Ultra Modern", "building", "MSA-UM"),
    ],
    "MTG": [
        ("Car Park", "grounds", "MTG-PARK"),
        ("Staff Quarters", "residential", "MTG-SQ"),
        ("Standby Generator", "equipment", "MTG-GEN"),
        ("Kitchen Boiler", "equipment", "MTG-BOIL"),
        ("Mwalughanje", "hostel", "MTG-MWA"),
        ("Administration Block", "office_block", "MTG-ADMIN"),
        ("Dining Hall", "building", "MTG-DIN"),
        ("Kitchen", "building", "MTG-KIT"),
        ("Customer Care", "office_block", "MTG-CARE"),
    ],
    "EMB": [
        ("Car Park", "grounds", "EMB-PARK"),
        ("Staff Quarters", "residential", "EMB-SQ"),
        ("Standby Generator", "equipment", "EMB-GEN"),
        ("Borehole Pump", "equipment", "EMB-PUMP"),
        ("Jumuiya", "hostel", "EMB-JUM"),
        ("Kiambere", "hostel", "EMB-KIA"),
        ("Administration Block", "office_block", "EMB-ADMIN"),
        ("Procurement", "building", "EMB-PROC"),
        ("Gate House", "building", "EMB-GH"),
        ("Kitchen", "building", "EMB-KIT"),
    ],
    "BAR": [
        ("Car Park", "grounds", "BAR-PARK"),
        ("Staff Quarters", "residential", "BAR-SQ"),
        ("Standby Generator", "equipment", "BAR-GEN"),
        ("Gate House", "building", "BAR-GH"),
        ("Administration Block", "office_block", "BAR-ADMIN"),
        ("Library", "office_block", "BAR-LIB"),
        ("Kipsunya", "building", "BAR-KIP"),
        ("Koilagen", "building", "BAR-KOI"),
    ],
}


# campus_code → (hod_first_last, hos_first_last)
SUPERVISORS = {
    "NRB": (("Aisha", "Wanjiru"), ("Peter", "Kimani")),
    "MSA": (("Salim", "Bakari"), ("Grace", "Achieng")),
    "MTG": (("Fatuma", "Mwangome"), ("Daniel", "Otieno")),
    "EMB": (("Njeri", "Muriuki"), ("Samuel", "Njagi")),
    "BAR": (("Cherop", "Kiptoo"), ("Mercy", "Jepkosgei")),
}

DEMO_TICKET_COUNT = 150
DEMO_WINDOW_DAYS = 90

# campus_code -> trade codes staffed there. Deliberately uneven: a masonry
# ticket at Baringo routes correctly and has nobody to assign it to.
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

# How often each status turns up in the demo backlog: mostly settled work with
# a live tail. The weights are seed's; the statuses are tickets.constants'.
STATUS_WEIGHTS = {
    "open": 4,
    "assigned": 3,
    "in_progress": 4,
    "pending": 2,
    "resolved": 5,
    "closed": 6,
}

# One generator per facility type in TYPE_SPECS, producing a location the API
# would accept. `_check_demo_tables` proves both halves of that every run.
LOCATION_VALUES = {
    "office_block": lambda r: {"floor": str(r.randint(0, 3)), "room": f"{r.randint(1, 4)}{r.randint(10, 40)}"},
    "hostel": lambda r: {"room_number": f"{r.choice('ABC')}-{r.randint(101, 320)}"},
    "building": lambda r: {"area": r.choice(["Main hall", "Servery", "Ground floor", "Rear wing", "Entrance"])},
    "residential": lambda r: {
        "tenant_name": r.choice(["J. Mwangi", "A. Chepkoech", "S. Omondi", "M. Wairimu"]),
        "unit_number": f"Q{r.randint(1, 24)}",
    },
    "grounds": lambda r: {"landmark": r.choice(["By the gate", "Rear fence", "Near the mast"])},
    "equipment": lambda r: {},
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

        self._check_demo_tables()

        with transaction.atomic():
            self._seed_facility_types()
            priorities = self._seed_priorities()

            campuses = self._seed_campuses()
            trades = self._seed_trades()
            self._seed_service_items(trades)
            self._seed_facilities(campuses)

            self._seed_admin(password)
            self._seed_director(password)
            self._seed_supervisors(campuses, password)
            self._seed_technicians(campuses, trades, password)
            requesters = self._seed_requesters(campuses, password)

            if options["no_demo"]:
                self.stdout.write("  Demo tickets: skipped (--no-demo)")
            else:
                self._seed_demo_tickets(campuses, trades, requesters, priorities)
                self._run_escalations()

        self._print_demo_logins()
        self.stdout.write(self.style.SUCCESS("Seed complete."))

    def _check_demo_tables(self):
        """Fail before writing anything if a demo table has drifted from the code
        that declares it.

        Seed follows the declarations, it never defines them, and the failure it
        guards against is silent: an unlisted status simply never gets generated,
        and an unlisted facility type gets a location of `{}` that the API would
        have rejected.
        """
        self._same_keys(STATUS_WEIGHTS, ALL_STATUSES, "demo status weights")
        self._same_keys(PENDING_NOTES, PENDING_REASON_CODES, "hold-reason notes")
        self._same_keys(LOCATION_VALUES, TYPE_SPECS, "demo location values")

        # The same two orderings `sla.serializers` refuses over the API. Seeding
        # around the serializer must not be the way an inverted pair gets in.
        for name, _, response, resolution, hos, hod in PRIORITY_LEVELS:
            for earlier, later, first, second in (
                ("response", "resolution", response, resolution),
                ("escalate_to_hos", "escalate_to_hod", hos, hod),
            ):
                if first > second:
                    raise CommandError(
                        f"PRIORITY_LEVELS['{name}'] is out of order: "
                        f"{earlier} ({first}) must not exceed {later} ({second})."
                    )

        # Not just the right types: the values themselves must be a location the
        # API would accept, checked against the same spec that validates one.
        rng = random.Random(0)
        for code, build in LOCATION_VALUES.items():
            spec = TYPE_SPECS[code]
            values = set(build(rng))
            if not spec["required"] <= values <= spec["known"]:
                raise CommandError(
                    f"seed's demo location for '{code}' would be rejected by "
                    f"TYPE_SPECS: builds {sorted(values)}, requires "
                    f"{sorted(spec['required'])}, allows {sorted(spec['known'])}."
                )

    @staticmethod
    def _same_keys(demo, declared, what):
        """Raise unless a demo table covers exactly the keys the code declares."""
        missing = set(declared) - set(demo)
        unknown = set(demo) - set(declared)
        if missing or unknown:
            raise CommandError(
                f"seed's {what} has drifted from the code that declares it: "
                f"missing {sorted(missing)}, unknown {sorted(unknown)}."
            )

    def _print_demo_logins(self):
        """One account per role. Sign-in is by email and the addresses are
        people's names, so the role is not guessable from the address."""
        roster = self._roster or []
        self.stdout.write("")
        self.stdout.write("  Demo logins (password: $SEED_DEFAULT_PASSWORD)")
        for role in ("admin", "manager", "hod", "hos", "technician", "user"):
            rows = [row for row in roster if row[0] == role]
            if not rows:
                continue
            # Prefer Nairobi: it is the campus every other demo path starts from.
            row = next((r for r in rows if r[1] == "NRB"), rows[0])
            self.stdout.write(f"    {role:<11}{row[1]:<5}{row[2]}")
        self.stdout.write(
            "    Every account is first.last@ksg.ac.ke — the Users page lists the rest."
        )

    def _run_escalations(self):
        """Let the escalation engine act on the demo data it just inherited.

        Escalation is automatic: a ticket whose active time passes its
        priority's threshold climbs technician → HOS → HOD. Running the real
        engine rather than stamping levels by hand means the demo shows what
        production would actually have done.
        """
        from apps.tickets.escalation import run_escalations

        count = run_escalations()
        self.stdout.write(f"  Escalations: {count} ticket(s) raised above the technician")


    def _seed_facility_types(self):
        for code, spec in TYPE_SPECS.items():
            FacilityType.objects.get_or_create(
                code=code, defaults={"name": spec["label"]}
            )
        self.stdout.write(f"  FacilityType: {len(TYPE_SPECS)}")

    def _seed_priorities(self):
        priorities = {}
        for name, rank, response, resolution, hos_minutes, hod_minutes in PRIORITY_LEVELS:
            priorities[name] = Priority.objects.get_or_create(
                rank=rank,
                defaults={
                    "name": name,
                    "response_minutes": response,
                    "resolution_minutes": resolution,
                    "escalate_to_hos_minutes": hos_minutes,
                    "escalate_to_hod_minutes": hod_minutes,
                },
            )[0]
        self.stdout.write(f"  Priority: {len(priorities)} (tickets open at Low)")
        return priorities

    def _seed_campuses(self):
        campuses = {}
        for name, code, location in CAMPUSES:
            campuses[code] = Campus.objects.get_or_create(
                code=code, defaults={"name": name, "location": location}
            )[0]
        self.stdout.write(f"  Campus: {len(campuses)}")
        return campuses

    def _seed_trades(self):
        trades = {}
        for name, code in SUB_SECTIONS:
            trades[code] = Trade.objects.get_or_create(
                name=name, defaults={"code": code}
            )[0]
        self.stdout.write(f"  Trade: {len(trades)}")
        return trades

    def _seed_service_items(self, trades):
        count = 0
        for code, names in SERVICE_ITEMS.items():
            for name in names:
                ServiceItem.objects.get_or_create(
                    trade=trades[code], name=name
                )
                count += 1
        self.stdout.write(f"  ServiceItem: {count}")

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


    _phone_counter = 0

    def _next_phone(self):
        """A distinct, obviously-fake Kenyan mobile per demo ticket, in E.164.

        Through `normalise_phone` rather than formatted by hand, so seed cannot
        mint a number the ticket API would refuse.
        """
        self._phone_counter += 1
        return normalise_phone(f"07{self._phone_counter:08d}")

    _usernames = None

    def _make_user(self, first, last, password, campus=None):
        """Create a person from their name the way the app creates them from an
        email: address first (`first.last@ksg.ac.ke`), username derived back out
        of it, so seeded accounts are indistinguishable from registered ones.

        Two seeded people sharing a name would share an address and therefore an
        account, so that is a hard error rather than a `get_or_create`.
        """
        email = f"{first}.{last}@ksg.ac.ke".lower()
        username = local_part(email)
        if self._usernames is None:
            self._usernames = set()
        if username in self._usernames:
            raise CommandError(
                f"Two seeded people are called {first} {last}: both would be "
                f"{email}, i.e. one account. Give one of them a different name."
            )
        self._usernames.add(username)

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "first_name": first,
                "last_name": last,
                "email": email,
            },
        )
        if created:
            user.set_password(password)
            user.save(update_fields=["password"])
        # The admin has no campus: they are not based at one.
        if campus is not None and user.campus_id != campus.pk:
            user.campus = campus
            user.save(update_fields=["campus"])
        return user

    _roster = None

    def _set_role(self, user, role, trades=(), **scope):
        """One call writes the role and the org FK that grants it.

        Delegates to `accounts.posts.assign_role`, the only writer of both. A
        seed keeping its own copy would seed a state the running app cannot
        produce.
        """
        assign_role(user, role, trades=trades, **scope)
        if self._roster is None:
            self._roster = []
        campus = user.campus
        self._roster.append((role, campus.code if campus else "-", user.email))

    def _seed_admin(self, password):
        user = self._make_user("System", "Administrator", password)
        if not user.is_staff:
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=["is_staff", "is_superuser"])
        self._set_role(user, "admin")
        self.stdout.write("  admin: 1")

    def _seed_director(self, password):
        """The Corporate HOD — manager role, oversight across all campuses."""
        user = self._make_user("Wanjiku", "Kamau", password)
        self._set_role(user, "manager")
        self.stdout.write("  manager: 1 (director)")

    def _seed_supervisors(self, campuses, password):
        for campus_code, ((hod_first, hod_last), (hos_first, hos_last)) in SUPERVISORS.items():
            campus = campuses[campus_code]

            hod = self._make_user(hod_first, hod_last, password, campus)
            self._set_role(hod, "hod", campus=campus)

            hos = self._make_user(hos_first, hos_last, password, campus)
            self._set_role(hos, "hos", campus=campus)

        self.stdout.write(f"  hod: {len(SUPERVISORS)}   hos: {len(SUPERVISORS)}")

    def _seed_technicians(self, campuses, trades, password):
        """One technician per staffed trade, plus a multi-trade finisher at Nairobi.

        The role row alone grants a technician nothing — access comes from the
        TechnicianTrade links, which is what pins them to (campus, trade).
        """
        names = iter(TECHNICIAN_NAMES)
        count = 0
        for campus_code, trade_codes in TRADE_STAFFING.items():
            campus = campuses[campus_code]
            for trade_code in trade_codes:
                try:
                    first, last = next(names)
                except StopIteration:
                    names = iter(TECHNICIAN_NAMES)
                    first, last = next(names)
                user = self._make_user(first, last, password, campus)
                self._set_role(
                    user,
                    "technician",
                    campus=campus,
                    trades=[trades[trade_code]],
                )
                count += 1

        # Technicians working more than one trade, so the work-mix report is not every
        # technician at 100% of one craft.
        multi_trade = [
            ("NRB", "Anthony", "Gitau", ("CARP", "PAINT")),
            ("MSA", "Miriam", "Odongo", ("PLUMB", "ELEC")),
            ("EMB", "Daniel", "Kiptoo", ("MAS", "PLUMB", "PAINT")),
        ]
        for campus_code, first, last, trade_codes in multi_trade:
            campus = campuses[campus_code]
            user = self._make_user(first, last, password, campus)
            self._set_role(
                user,
                "technician",
                campus=campus,
                trades=[trades[code] for code in trade_codes],
            )
            count += 1

        self.stdout.write(f"  technician: {count}")

    def _seed_requesters(self, campuses, password):
        codes = list(campuses)
        requesters = []
        for index, (first, last) in enumerate(REQUESTER_NAMES):
            campus_code = codes[index % len(codes)]
            user = self._make_user(
                first, last, password, campuses[campus_code]
            )
            self._set_role(user, "user")
            requesters.append(user)
        self.stdout.write(f"  user: {len(requesters)}")
        return requesters


    def _seed_demo_tickets(self, campuses, trades, requesters, priorities):
        if Ticket.objects.exists():
            self.stdout.write("  Demo tickets: skipped (tickets already exist)")
            return

        rng = random.Random(20260808)  # deterministic — same demo data every run
        now = timezone.now()
        items_by_trade = {
            code: list(ServiceItem.objects.filter(trade=sub))
            for code, sub in trades.items()
        }
        facilities_by_campus = {
            code: list(
                Facility.objects.filter(campus__code=code).select_related("facility_type")
            )
            for code in campuses
        }
        # Every technician on the pair, not one: a dict kept whichever link came last,
        # so multi-trade people never received work in their second trade.
        technicians = defaultdict(list)
        for link in TechnicianTrade.objects.select_related("user"):
            technicians[(link.campus_id, link.trade_id)].append(link.user)

        statuses = [s for s, weight in STATUS_WEIGHTS.items() for _ in range(weight)]

        staffed_pairs = [
            (campus_code, trade_code)
            for campus_code, trade_codes in TRADE_STAFFING.items()
            for trade_code in trade_codes
        ]
        unstaffed_pairs = [
            (campus_code, trade_code)
            for campus_code in campuses
            for trade_code in trades
            if (campus_code, trade_code) not in staffed_pairs
        ]

        created = 0
        for index in range(DEMO_TICKET_COUNT):
            # Every sixth ticket lands in an unstaffed trade, so the "routed
            # but nobody to assign" state is visible without swamping the data.
            pool = unstaffed_pairs if index % 6 == 5 and unstaffed_pairs else staffed_pairs
            campus_code, trade_code = rng.choice(pool)
            campus = campuses[campus_code]
            trade = trades[trade_code]
            requester = rng.choice(requesters)
            item = rng.choice(items_by_trade[trade_code])
            status = rng.choice(statuses)

            candidates = technicians.get((campus.id, trade.id)) or []
            technician = rng.choice(candidates) if candidates else None
            if technician is None:
                status = "open"

            age_minutes = demo_age_minutes(rng)
            created_at = now - timedelta(minutes=age_minutes)
            priority = priorities["Low"] if status == "open" else rng.choice(
                [priorities["Low"], priorities["Medium"],
                 priorities["High"], priorities["Critical"]]
            )

            facility = self._pick_facility(facilities_by_campus[campus_code], rng)
            ticket = self._create_ticket(
                requester=requester, campus=campus, trade=trade,
                item=item, priority=priority, status=status,
                technician=technician, created_at=created_at,
                facility=facility, rng=rng,
                description=f"{item.name} reported by {display_name(requester)}.",
            )

            self._write_history(ticket, technician, created_at, rng)
            created += 1

        created += self._seed_chronic_faults(
            campuses, trades, requesters, priorities, technicians,
            facilities_by_campus, items_by_trade, rng, now,
        )
        self.stdout.write(
            f"  Demo tickets: {created} over the last {DEMO_WINDOW_DAYS} days"
        )

    def _seed_chronic_faults(
        self, campuses, trades, requesters, priorities, technicians,
        facilities_by_campus, items_by_trade, rng, now,
    ):
        """A handful of buildings with the same fault, over and over.

        Real estates behave this way: one hostel's drainage, one block's
        wiring. Uniformly random demo data gives every facility the same count,
        so the facility breakdown draws a flat chart.
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
            campus = campuses[campus_code]
            trade = trades[trade_code]
            item = next(
                (i for i in items_by_trade[trade_code] if i.name == item_name), None
            )
            facility = next(
                (f for f in facilities_by_campus[campus_code] if f.name == facility_name),
                None,
            )
            if item is None or facility is None:
                continue

            candidates = technicians.get((campus.id, trade.id)) or []
            for _ in range(rng.randint(3, 5)):
                requester = rng.choice(requesters)
                status = rng.choice(["closed", "closed", "resolved", "in_progress", "open"])
                technician = rng.choice(candidates) if candidates else None
                if technician is None:
                    status = "open"
                priority = priorities["Low"] if status == "open" else rng.choice(
                    [priorities["Low"], priorities["Medium"], priorities["High"]]
                )
                created_at = now - timedelta(minutes=demo_age_minutes(rng))
                ticket = self._create_ticket(
                    requester=requester, campus=campus, trade=trade,
                    item=item, priority=priority, status=status,
                    technician=technician, created_at=created_at,
                    facility=facility, rng=rng,
                    description=f"{item.name} reported at {facility.name}.",
                )
                self._write_history(ticket, technician, created_at, rng)
                created += 1
        return created

    def _create_ticket(self, *, requester, campus, trade, item, priority,
                       status, technician, created_at, facility, rng, description):
        """Create one demo ticket and back-date it.

        Both generators above need exactly this, and they had a copy each —
        including their own hand-rolled SLA arithmetic, which is what
        Priority.due_dates() exists to prevent a second definition of.
        """
        response_due_at, resolution_due_at = priority.due_dates(created_at)
        ticket = Ticket.objects.create(
            raised_by=requester,
            requester_campus=campus,
            service_item=item,
            trade=trade,
            priority=priority,
            assigned_to=None if status == "open" else technician,
            facility=facility,
            location_values=self._location_values(facility.facility_type, rng),
            description=description,
            contact_phone=self._next_phone(),
            status=status,
            response_due_at=response_due_at,
            resolution_due_at=resolution_due_at,
        )
        # created_at is auto_now_add; rewrite it so the demo spans DEMO_WINDOW_DAYS.
        Ticket.objects.filter(pk=ticket.pk).update(created_at=created_at)
        ticket.refresh_from_db()
        return ticket

    @staticmethod
    def _pick_facility(facilities, rng):
        """One facility off the campus's register."""
        # Weighted, not uniform: an even spread drew a facility chart of equal stubs.
        weights = [4 if i < 2 else 2 if i < 5 else 1 for i in range(len(facilities))]
        return rng.choices(facilities, weights=weights)[0]

    @staticmethod
    def _location_values(facility_type, rng):
        """The type's own extra fields come from LOCATION_VALUES — mirroring
        TYPE_SPECS, which is what the API validates a real submission against."""
        builder = LOCATION_VALUES.get(facility_type.code)
        return builder(rng) if builder else {}

    @staticmethod
    def _log(ticket, when, **fields):
        """Write a TicketLog stamped `when` rather than now.

        `created_at` is auto_now_add, so a plain create() would stamp every log
        with the moment the seed ran: response SLA is measured from the first
        action log, and each ticket's timeline would happen in one second.
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

        response_window = timedelta(minutes=ticket.priority.response_minutes)
        if rng.random() < 0.85:
            assigned_at = created_at + response_window * rng.uniform(0.1, 0.9)
        else:
            assigned_at = created_at + response_window * rng.uniform(1.2, 3.0)
        self._log(
            ticket, assigned_at, event_type="assigned", actor=None,
            to_value=display_name(technician),
        )
        started_at = assigned_at + timedelta(minutes=rng.randint(5, 240))
        if ticket.status in ("in_progress", "pending") + TERMINAL_STATUSES:
            self._log(
                ticket, started_at, event_type="status_changed", actor=technician,
                from_value="assigned", to_value="in_progress",
            )
        if ticket.status == "pending":
            # Weighted: a maintenance section is stopped by parts far more often than by
            # anything else.
            reason = rng.choices(list(PENDING_NOTES), weights=[30, 24, 16, 14, 9, 7])[0]
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
        if ticket.status in TERMINAL_STATUSES:
            # Relative to the ticket's own SLA window: a flat draw ignores priority, so
            # only 7% of resolved tickets met their deadline and every gauge read 0%.
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
            closed_at = resolved_at + timedelta(hours=rng.randint(2, 48))
            Ticket.objects.filter(pk=ticket.pk).update(closed_at=closed_at)
            self._log(
                ticket, closed_at, event_type="closed", actor=ticket.raised_by,
                from_value="resolved", to_value="closed",
            )
            if rng.random() < 0.7:
                rating = rng.choice([3, 4, 4, 5, 5, 5])
                Ticket.objects.filter(pk=ticket.pk).update(
                    rating=rating,
                    rating_comment=rng.choice(
                        ["", "", "Quick turnaround, thank you.", "Well handled."]
                    ),
                    rated_at=closed_at,
                )
                # `TicketFeedbackView` logs the rating, so the demo trail does too.
                self._log(
                    ticket, closed_at, event_type="rated",
                    actor=ticket.raised_by, to_value=str(rating),
                )
