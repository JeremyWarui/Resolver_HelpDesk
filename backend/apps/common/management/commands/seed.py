"""Seed the Maintenance Helpdesk. Idempotent on natural keys; demo tickets are
skipped entirely if any already exist.

    SEED_DEFAULT_PASSWORD='…' python manage.py seed
    SEED_DEFAULT_PASSWORD='…' python manage.py seed --no-demo   # structure only
"""

import io
import os
import random
from collections import defaultdict
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.identity import display_name, local_part
from apps.accounts.models import TechnicianTrade
from apps.accounts.posts import assign_role
from apps.facilities.models import FACILITY_TYPES, Facility, FacilityType
from apps.notifications.models import Notification
from apps.notifications.notify import (
    emit_comment_added,
    emit_ticket_assigned,
    emit_ticket_created,
    emit_ticket_resolved,
    emit_ticket_status_changed,
)
from apps.org.models import Campus, ServiceItem, Trade
from apps.sla.models import PRIORITY_LEVELS, Priority
from apps.system_feedback.models import SystemFeedback
from apps.tickets.constants import (
    ALL_STATUSES,
    PENDING_REASON_CODES,
    PENDING_REASON_LABELS,
    TERMINAL_STATUSES,
)
from apps.tickets.models import Ticket, TicketAttachment, TicketComment, TicketLog
from apps.tickets.phone import normalise_phone

User = get_user_model()

# Split by when it is written: a live job reports progress, a finished one closes out.
PROGRESS_NOTES = [
    "On site. Isolated the fault, working through it now.",
    "Started — need to get behind the panel to reach it.",
    "Assessed. Straightforward once the area is clear.",
    "Attended. Bringing the right fitting back this afternoon.",
]

COMPLETION_NOTES = [
    "Fault traced and repaired. Tested and working.",
    "Parts replaced, area cleaned up.",
    "Repaired on site — no further action needed.",
    "Replaced the unit. Left the old one at the store.",
]

# The only demo comment with a recipient: a technician's own notifies nobody.
SUPERVISOR_NOTES = [
    "Any movement on this one? The occupant has chased twice.",
    "Please close this out today if the part has landed.",
    "Checking in — flag it to me if you are blocked.",
]

# The HOS's note to the technician when handing a job over. Only the
# technician hears it; the requester's trail leaves it out.
HANDOVER_NOTES = [
    "Occupant is in from 8am; call before you go up.",
    "Second report this month. Find the cause, not just the symptom.",
    "Keys are with the hostel warden.",
    "Take the stepladder; it is above the false ceiling.",
    "Use the stock in store B before raising an order.",
]

# What a requester writes in the description, by service item: their words,
# not the catalogue's.
DESCRIPTIONS = {
    "Repair door or door frame": [
        "The door drags on the floor and will not close without a shove.",
        "Frame has split by the hinge side; the door hangs loose.",
    ],
    "Replace lock or hinges": [
        "Lock turns but the latch does not catch. Room cannot be secured.",
        "Top hinge has pulled out of the frame.",
    ],
    "Repair furniture": [
        "Two chairs in the room have broken legs.",
        "Desk drawer runner snapped; the drawer falls out.",
    ],
    "Fit or repair shelving": [
        "Shelf above the desk has come away from the wall.",
        "Need two shelves fitted for files; brackets are here.",
    ],
    "Repair window frame": [
        "Window will not shut fully and rain comes in.",
        "Frame is rotten at the bottom corner; glass is loose.",
    ],
    "Ceiling board repair": [
        "Ceiling board sagging after the last rains, near the light.",
        "A board fell in the corridor; the gap shows the roof.",
    ],
    "Repair cracked wall": [
        "Crack running from the window to the floor, getting wider.",
        "Wall behind the sink is cracked and damp.",
    ],
    "Repair floor or tiles": [
        "Several tiles lifted by the entrance; people are tripping.",
        "Floor screed broken in the middle of the room.",
    ],
    "Repair paving or walkway": [
        "Paving slabs sunk on the walkway to the hostel; water pools there.",
        "Kerb broken at the car park entrance.",
    ],
    "Repair drainage channel": [
        "Drain cover missing on the path, deep gap.",
        "Channel blocked with silt; water floods the walkway when it rains.",
    ],
    "Plaster repair": [
        "Plaster flaking off the wall behind the door.",
        "Patch of plaster fell off after the socket was moved.",
    ],
    "Repaint room": [
        "Room walls are marked and peeling; due a repaint.",
        "Repaint needed after the leak repair, stains still showing.",
    ],
    "Touch-up paint": [
        "Scuffs along the corridor from furniture moving.",
        "Door frame paint chipped, bare wood showing.",
    ],
    "Repaint exterior wall": [
        "Outside wall facing the road is faded and streaked.",
        "Exterior paint blistering under the gutter.",
    ],
    "Varnish woodwork": [
        "Reception counter varnish worn through.",
        "Wooden benches outside need varnish before the rains.",
    ],
    "Remove graffiti or stains": [
        "Writing on the wall by the stairs.",
        "Water stain on the ceiling and wall from the old leak.",
    ],
    "Leaking tap or pipe": [
        "Tap in the washroom will not stop dripping.",
        "Pipe under the sink leaking into the cupboard.",
    ],
    "Blocked toilet, sink or drain": [
        "Toilet blocked and overflowing; washroom closed.",
        "Sink drains very slowly and smells.",
    ],
    "Faulty cistern": [
        "Cistern keeps running after flushing.",
        "Flush handle broken; cistern does not fill.",
    ],
    "Water heater fault": [
        "No hot water in the shower block since morning.",
        "Heater trips the power when switched on.",
    ],
    "No water supply": [
        "No water in the block since last night.",
        "Taps on the first floor dry; ground floor is fine.",
    ],
    "Burst pipe": [
        "Pipe burst outside the kitchen, water everywhere.",
        "Water spraying from the wall in the washroom.",
    ],
    "Faulty socket or switch": [
        "Socket by the desk sparks when a plug goes in.",
        "Light switch is loose and hot to touch.",
    ],
    "Lighting fault": [
        "Corridor lights out on the second floor.",
        "Tube light flickering all day in the office.",
    ],
    "Power outage in room": [
        "No power in the room; the rest of the floor has power.",
        "Sockets dead since the storm.",
    ],
    "Faulty air conditioner": [
        "AC blowing warm air and dripping water.",
        "Air conditioner makes a loud noise and switches off.",
    ],
    "Generator fault": [
        "Generator did not start during the outage.",
        "Generator runs but the changeover does not switch.",
    ],
    "Faulty appliance": [
        "Kettle in the staff room trips the socket.",
        "Fridge not cooling.",
    ],
}

# A rating's comment matches its stars. Most people leave none.
RATING_COMMENTS = {
    5: ["Quick turnaround, thank you.", "Fixed properly, and the area was left clean."],
    4: ["Well handled.", "Good job, took a day longer than hoped."],
    3: ["Fixed, but I had to follow up twice.", "Works now. Took a while."],
    2: ["Same fault came back within a week.", "Nobody told me when they were coming."],
}

# What people say about Resolver itself, from the sidebar's Send feedback:
# (first, last, category, message, page, reviewed).
SYSTEM_FEEDBACK = [
    ("Caroline", "Wafula", "praise",
     "Raising a fault from my phone took a minute. Much easier than calling.", "/user", True),
    ("Esther", "Wairimu", "idea",
     "Let me attach a photo when I resolve a job, to show it is done.", "/tech", False),
    ("Peter", "Kimani", "problem",
     "The escalated list does not say how long a job has been with me.", "/hos/escalated", False),
    ("Dennis", "Kimutai", "other",
     "Could the location list include the new lecture block?", "/user", True),
    ("Grace", "Achieng", "idea",
     "A weekly summary email of what is still open would help.", "/hos", False),
    ("Wanjiku", "Kamau", "praise",
     "The campus comparison answers most of what the board asks me.", "/director/reports", True),
    ("Anthony", "Gitau", "problem",
     "When holding a job I could not say the occupant needs to clear the room first.", "/tech", False),
]

# Messages older than this have been seen by their recipients.
READ_AFTER_DAYS = 1

PENDING_NOTES = {
    "material_not_in_store": "Replacement parts not in the store.",
    "awaiting_material_requested": "LPO raised — supplier has not delivered.",
    "requester_unavailable": "Occupant to confirm a time we can work.",
    "location_inaccessible": "Room in use — rescheduled with the occupant.",
    "additional_labour_required": "Needs a second pair of hands to lift out.",
    "technical_assistance_required": "Beyond the section — specialist booked.",
}


def demo_age_minutes(rng):
    """How long ago a demo ticket was raised: densest now, thinning smoothly back.

    A smooth decay keeps the trend line free of steps, gives the 30-day view
    most of the data, and puts enough work in the last few days for each
    technician to hold a real queue.
    """
    days = min(rng.expovariate(1 / 20), DEMO_WINDOW_DAYS)
    return max(int(days * 24 * 60), 30)


def demo_priority(rng, priorities, status):
    """Low until the HOS sets it; then weighted the way a section's work runs.

    Urgent work is cleared first, so little of what is still live is High or
    Critical.
    """
    if status == "open":
        return priorities["Low"]
    weights = [40, 35, 18, 7] if status in TERMINAL_STATUSES else [80, 15, 4, 1]
    name = rng.choices(["Low", "Medium", "High", "Critical"], weights=weights)[0]
    return priorities[name]


def by_now(after, when, now, rng):
    """`when`, or if that is still to come, a moment between `after` and now."""
    if when <= now:
        return when
    return after + (now - after) * rng.uniform(0.3, 0.9)


CAMPUSES = [
    ("Nairobi", "NRB", "Lower Kabete"),
    ("Mombasa", "MSA", "Mombasa"),
    ("Matuga", "MTG", "Kwale"),
    ("Embu", "EMB", "Embu"),
    ("Baringo", "BAR", "Kabarnet"),
]

# Global: all five run at every campus.
TRADES = [
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


# campus_code → [(name, facility_type_code)]
FACILITIES = {
    "NRB": [
        ("Staff Quarters A", "residential"),
        ("Staff Quarters B", "residential"),
        ("Standby Generator", "equipment"),
        ("Borehole Pump", "equipment"),
        ("Habel Nyamu Library", "office_block"),
        ("Administration Block", "office_block"),
        ("Convention Center", "office_block"),
        ("eLITI", "office_block"),
        ("Conference Center", "building"),
        ("Maasai Mara", "building"),
        ("Gate House", "building"),
        ("Margaret Kobia", "hostel"),
        ("Gateere", "hostel"),
        ("Wamalwa", "hostel"),
        ("Sawe", "hostel"),
        ("Mekatilili", "hostel"),
        ("Kamoche", "building"),
        ("Maandalizi", "building"),
        ("Gas Point", "grounds"),
        ("Sacho", "office_block"),
        ("Field", "grounds"),
        ("Mt. Kenya", "office_block"),
    ],
    "MSA": [
        ("Car Park", "grounds"),
        ("Staff Quarters", "residential"),
        ("Standby Generator", "equipment"),
        ("Water Pump", "equipment"),
        ("Administration Block", "office_block"),
        ("Galana", "hostel"),
        ("Ultra Modern", "building"),
    ],
    "MTG": [
        ("Car Park", "grounds"),
        ("Staff Quarters", "residential"),
        ("Standby Generator", "equipment"),
        ("Kitchen Boiler", "equipment"),
        ("Mwalughanje", "hostel"),
        ("Administration Block", "office_block"),
        ("Dining Hall", "building"),
        ("Kitchen", "building"),
        ("Customer Care", "office_block"),
    ],
    "EMB": [
        ("Car Park", "grounds"),
        ("Staff Quarters", "residential"),
        ("Standby Generator", "equipment"),
        ("Borehole Pump", "equipment"),
        ("Jumuiya", "hostel"),
        ("Kiambere", "hostel"),
        ("Administration Block", "office_block"),
        ("Procurement", "building"),
        ("Gate House", "building"),
        ("Kitchen", "building"),
    ],
    "BAR": [
        ("Car Park", "grounds"),
        ("Staff Quarters", "residential"),
        ("Standby Generator", "equipment"),
        ("Gate House", "building"),
        ("Administration Block", "office_block"),
        ("Library", "office_block"),
        ("Kipsunya", "building"),
        ("Koilagen", "building"),
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

DEMO_TICKET_COUNT = 420
DEMO_WINDOW_DAYS = 90
# Past this age every demo ticket is finished (`STATUS_BY_AGE`).
SETTLED_AFTER_DAYS = 14

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

# A demo ticket's status follows from how long ago it was raised: new work is
# live, a week-old job is mostly finished, and nothing past SETTLED_AFTER_DAYS
# is still open or waiting on a rating. (up to this many days old, weights)
STATUS_BY_AGE = [
    (1, {"open": 30, "assigned": 22, "in_progress": 38, "pending": 4, "resolved": 6}),
    (2, {"open": 8, "assigned": 10, "in_progress": 36, "pending": 10, "resolved": 26, "closed": 10}),
    (7, {"open": 1, "assigned": 1, "in_progress": 3, "pending": 6, "resolved": 24, "closed": 65}),
    (SETTLED_AFTER_DAYS, {"in_progress": 1, "pending": 3, "resolved": 8, "closed": 88}),
    (None, {"closed": 1}),
]


def status_for_age(rng, age_minutes):
    """A demo ticket's status, drawn from the band its age falls in."""
    days = age_minutes / (24 * 60)
    weights = next(w for limit, w in STATUS_BY_AGE if limit is None or days < limit)
    return rng.choices(list(weights), weights=list(weights.values()))[0]


# One generator per facility type in FACILITY_TYPES: the room, floor or spot a
# requester would type.
LOCATION_DETAILS = {
    "office_block": lambda r: f"Floor {r.randint(0, 3)}, Room {r.randint(1, 4)}{r.randint(10, 40)}",
    "hostel": lambda r: f"Room {r.choice('ABC')}-{r.randint(101, 320)}",
    "building": lambda r: r.choice(["Main hall", "Servery", "Ground floor", "Rear wing", "Entrance"]),
    "residential": lambda r: f"Unit Q{r.randint(1, 24)}",
    "grounds": lambda r: r.choice(["By the gate", "Rear fence", "Near the mast"]),
    "equipment": lambda r: r.choice(["Plant room", "Generator house", "Pump house"]),
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
            posts = self._seed_supervisors(campuses, password)
            self._seed_technicians(campuses, trades, password)
            requesters = self._seed_requesters(campuses, password)

            if options["no_demo"]:
                self.stdout.write("  Demo tickets: skipped (--no-demo)")
            else:
                self._seed_demo_tickets(
                    campuses, trades, requesters, priorities, posts
                )
                self._run_escalations()
                self._mark_old_notifications_read()
                self._stamp_updated_at()
                self._seed_system_feedback()

        self._print_demo_logins()
        self.stdout.write(self.style.SUCCESS("Seed complete."))

    def _check_demo_tables(self):
        """Fail before writing anything if a demo table has drifted from the code
        that declares it.

        Seed follows the declarations, it never defines them, and the failure it
        guards against is silent: an unlisted status simply never gets generated.
        """
        self._same_keys(
            {code for _, weights in STATUS_BY_AGE for code in weights},
            ALL_STATUSES,
            "demo statuses by age",
        )
        self._same_keys(PENDING_NOTES, PENDING_REASON_CODES, "hold-reason notes")
        self._same_keys(LOCATION_DETAILS, FACILITY_TYPES, "demo location details")
        self._same_keys(
            DESCRIPTIONS,
            [name for names in SERVICE_ITEMS.values() for name in names],
            "demo descriptions",
        )

        # One name is one email is one account, so the pool cannot be reused.
        needed = sum(len(codes) for codes in TRADE_STAFFING.values())
        if needed > len(TECHNICIAN_NAMES):
            raise CommandError(
                f"TRADE_STAFFING needs {needed} technicians but TECHNICIAN_NAMES "
                f"has {len(TECHNICIAN_NAMES)}. Add {needed - len(TECHNICIAN_NAMES)} "
                f"more name(s); they cannot be reused."
            )

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

        Each pass moves a ticket one level, as the scheduled check does, so it runs
        until nothing moves: the backlog it inherits has been waiting for weeks.
        """
        from apps.tickets.escalation import run_escalations

        moves = 0
        while moved := run_escalations():
            moves += moved
        self._date_escalations()
        self.stdout.write(f"  Escalations: {moves} level change(s) applied")

    @staticmethod
    def _date_escalations():
        """Move each escalation, and its messages, to when the ticket crossed the threshold.

        The engine stamps what it does with the moment it runs, which for
        inherited demo work would put every escalation at the seed's own time.
        Its messages name the level, which is how they are matched to the step.
        """
        from apps.tickets.escalation import thresholds

        now = timezone.now()
        steps = TicketLog.objects.filter(event_type="escalated").select_related(
            "ticket__priority"
        )
        for log in steps:
            ticket = log.ticket
            minutes = dict(thresholds(ticket.priority))[log.to_value]
            when = min(
                ticket.clock_started_at + ticket.accumulated_pause + timedelta(minutes=minutes),
                now,
            )
            TicketLog.objects.filter(pk=log.pk).update(created_at=when)
            Notification.objects.filter(
                ticket=ticket, event_type="ticket_escalated",
                body__icontains=log.to_value,
            ).update(created_at=when)

    def _stamp_updated_at(self):
        """Set each ticket's updated_at, an auto_now column, to its last trail event."""
        from django.db.models import Max, OuterRef, Subquery

        last = (
            TicketLog.objects.filter(ticket=OuterRef("pk"))
            .order_by()
            .values("ticket")
            .annotate(at=Max("created_at"))
            .values("at")
        )
        Ticket.objects.update(updated_at=Subquery(last))

    def _mark_old_notifications_read(self):
        """Mark messages older than READ_AFTER_DAYS read, as their recipients would have."""
        cutoff = timezone.now() - timedelta(days=READ_AFTER_DAYS)
        read = Notification.objects.filter(created_at__lt=cutoff).update(read=True)
        unread = Notification.objects.filter(read=False).count()
        self.stdout.write(f"  Notifications: {read} read, {unread} unread")

    def _seed_system_feedback(self):
        """A few things people have said about Resolver, some already reviewed."""
        if SystemFeedback.objects.exists():
            return
        now = timezone.now()
        for n, (first, last, category, message, page, reviewed) in enumerate(
            SYSTEM_FEEDBACK, start=1
        ):
            author = User.objects.get(email=f"{first}.{last}@ksg.ac.ke".lower())
            entry = SystemFeedback.objects.create(
                author=author,
                author_role=author.role_assignment.role,
                category=category,
                message=message,
                page=page,
                reviewed=reviewed,
            )
            SystemFeedback.objects.filter(pk=entry.pk).update(
                created_at=now - timedelta(days=n * 3, hours=n)
            )
        self.stdout.write(f"  System feedback: {len(SYSTEM_FEEDBACK)}")

    def _seed_facility_types(self):
        for code, name in FACILITY_TYPES.items():
            FacilityType.objects.get_or_create(code=code, defaults={"name": name})
        self.stdout.write(f"  FacilityType: {len(FACILITY_TYPES)}")

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
        for name, code in TRADES:
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
            for name, type_code in entries:
                Facility.objects.get_or_create(
                    campus=campuses[campus_code],
                    name=name,
                    defaults={"facility_type": types[type_code]},
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
        """Create both posts per campus. Returns `{campus_code: (hod, hos)}`."""
        posts = {}
        for campus_code, ((hod_first, hod_last), (hos_first, hos_last)) in SUPERVISORS.items():
            campus = campuses[campus_code]

            hod = self._make_user(hod_first, hod_last, password, campus)
            self._set_role(hod, "hod", campus=campus)

            hos = self._make_user(hos_first, hos_last, password, campus)
            self._set_role(hos, "hos", campus=campus)

            posts[campus_code] = (hod, hos)

        self.stdout.write(f"  hod: {len(SUPERVISORS)}   hos: {len(SUPERVISORS)}")
        return posts

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


    def _seed_demo_tickets(self, campuses, trades, requesters, priorities, posts):
        if Ticket.objects.exists():
            self.stdout.write("  Demo tickets: skipped (tickets already exist)")
            return

        rng = random.Random(20260808)  # deterministic — same demo data every run
        now = timezone.now()
        # Every list a draw picks from is in pk order, so the same seed gives
        # the same data on any database.
        items_by_trade = {
            code: list(ServiceItem.objects.filter(trade=sub).order_by("pk"))
            for code, sub in trades.items()
        }
        facilities_by_campus = {
            code: list(
                Facility.objects.filter(campus__code=code)
                .select_related("facility_type").order_by("pk")
            )
            for code in campuses
        }
        # Every technician on the pair, so multi-trade people get work in each trade.
        technicians = defaultdict(list)
        for link in TechnicianTrade.objects.select_related("user").order_by("pk"):
            technicians[(link.campus_id, link.trade_id)].append(link.user)

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

        # Everyone raises tickets, not only the `user` role (invariant 5).
        staff_raisers = {
            code: [hod, hos] for code, (hod, hos) in posts.items()
        }

        requesters_by_campus = defaultdict(list)
        for user in requesters:
            requesters_by_campus[user.campus.code].append(user)

        created = 0
        for index in range(DEMO_TICKET_COUNT):
            age_minutes = demo_age_minutes(rng)
            # Every twelfth recent ticket lands in an unstaffed trade, so the
            # "routed but nobody to assign" state shows without piling up.
            unstaffed = (
                index % 12 == 5 and unstaffed_pairs
                and age_minutes < SETTLED_AFTER_DAYS * 24 * 60
            )
            pool = unstaffed_pairs if unstaffed else staffed_pairs
            campus_code, trade_code = rng.choice(pool)
            campus = campuses[campus_code]
            trade = trades[trade_code]
            # Raised by someone based at that campus; one in eight by staff.
            if index % 8 == 3 and staff_raisers.get(campus_code):
                requester = rng.choice(staff_raisers[campus_code])
            else:
                requester = rng.choice(requesters_by_campus[campus_code])
            item = rng.choice(items_by_trade[trade_code])
            status = status_for_age(rng, age_minutes)

            candidates = technicians.get((campus.id, trade.id)) or []
            technician = rng.choice(candidates) if candidates else None

            if technician is None:
                status = "open"
            created_at = now - timedelta(minutes=age_minutes)
            priority = demo_priority(rng, priorities, status)

            facility = self._pick_facility(facilities_by_campus[campus_code], rng)
            ticket = self._create_ticket(
                requester=requester, trade=trade,
                item=item, priority=priority, status=status,
                technician=technician, created_at=created_at,
                facility=facility, rng=rng,
                description=rng.choice(DESCRIPTIONS[item.name]),
            )

            self._write_history(
                ticket, technician, created_at, rng,
                self._hos(posts, campus_code), now,
            )
            created += 1

        created += self._seed_chronic_faults(
            campuses, trades, requesters_by_campus, priorities, technicians,
            facilities_by_campus, items_by_trade, rng, now, posts,
        )
        self._seed_attachments(rng)
        self.stdout.write(
            f"  Demo tickets: {created} over the last {DEMO_WINDOW_DAYS} days"
        )
        self.stdout.write(
            f"  Notifications: {Notification.objects.count()}   "
            f"Comments: {TicketComment.objects.count()}"
        )

    @staticmethod
    def _hos(posts, campus_code):
        """The HOS at a campus, or None if the post is vacant."""
        post = posts.get(campus_code)
        return post[1] if post else None

    def _seed_chronic_faults(
        self, campuses, trades, requesters_by_campus, priorities, technicians,
        facilities_by_campus, items_by_trade, rng, now, posts,
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
                requester = rng.choice(requesters_by_campus[campus_code])
                age = demo_age_minutes(rng)
                status = status_for_age(rng, age)
                technician = rng.choice(candidates) if candidates else None
                if technician is None:
                    status = "open"
                priority = demo_priority(rng, priorities, status)
                created_at = now - timedelta(minutes=age)
                ticket = self._create_ticket(
                    requester=requester, trade=trade,
                    item=item, priority=priority, status=status,
                    technician=technician, created_at=created_at,
                    facility=facility, rng=rng,
                    description=rng.choice(DESCRIPTIONS[item.name]),
                )
                self._write_history(
                    ticket, technician, created_at, rng,
                    self._hos(posts, campus_code), now,
                )
                created += 1
        return created

    def _seed_attachments(self, rng):
        """Put a generated site photo on every twelfth ticket.

        Generated, not shipped: a binary does not belong in the repo.
        """
        from PIL import Image, ImageDraw

        tickets = list(
            Ticket.objects.select_related("raised_by", "assigned_to").order_by("pk")
        )[::12]

        count = 0
        for ticket in tickets:
            uploader = ticket.raised_by
            if ticket.assigned_to_id and rng.random() < 0.4:
                uploader = ticket.assigned_to

            colour = rng.choice(["#8b5e34", "#4a5568", "#7b3f3f", "#3f5a4a"])
            image = Image.new("RGB", (640, 480), colour)
            ImageDraw.Draw(image).text(
                (24, 24), f"{ticket.ticket_no}\n{ticket.service_item.name}"
            )
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=70, optimize=True)
            payload = buffer.getvalue()

            attachment = TicketAttachment(
                ticket=ticket,
                original_name=f"{ticket.ticket_no.lower()}-site-photo.jpg",
                mime_type="image/jpeg",
                stored_size=len(payload),
                uploaded_by=uploader,
            )
            attachment.file.save(
                f"{ticket.ticket_no}.jpg", ContentFile(payload), save=False
            )
            attachment.save()
            TicketAttachment.objects.filter(pk=attachment.pk).update(
                created_at=ticket.created_at + timedelta(minutes=rng.randint(1, 240))
            )
            count += 1

        self.stdout.write(f"  Attachments: {count}")

    def _create_ticket(self, *, requester, trade, item, priority,
                       status, technician, created_at, facility, rng, description):
        """Create one demo ticket and back-date it to `created_at`.

        The campus is the requester's own, as the API derives it, and the
        facility must be on it.
        """
        if facility.campus_id != requester.campus_id:
            raise CommandError(
                f"seed placed {display_name(requester)}'s ticket at "
                f"{facility.name}, which is not on their campus."
            )
        response_due_at, resolution_due_at = priority.due_dates(created_at)
        ticket = Ticket.objects.create(
            raised_by=requester,
            requester_campus=requester.campus,
            service_item=item,
            trade=trade,
            priority=priority,
            assigned_to=None if status == "open" else technician,
            facility=facility,
            location_detail=LOCATION_DETAILS[facility.facility_type.code](rng),
            description=description,
            contact_phone=self._next_phone(),
            status=status,
            response_due_at=response_due_at,
            resolution_due_at=resolution_due_at,
        )
        # created_at is auto_now_add; rewrite it so the demo spans DEMO_WINDOW_DAYS.
        Ticket.objects.filter(pk=ticket.pk).update(
            created_at=created_at, clock_started_at=created_at
        )
        ticket.refresh_from_db()
        return ticket

    @staticmethod
    def _pick_facility(facilities, rng):
        """One facility off the campus's register."""
        # Weighted, not uniform: an even spread drew a facility chart of equal stubs.
        weights = [4 if i < 2 else 2 if i < 5 else 1 for i in range(len(facilities))]
        return rng.choices(facilities, weights=weights)[0]

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

    @staticmethod
    def _notify(when, emit, *args, **kwargs):
        """Run a real emitter, then stamp its rows with the moment they describe.

        Through the emitters so the demo recipients are exactly production's.
        """
        high_water = (
            Notification.objects.order_by("-pk").values_list("pk", flat=True).first()
            or 0
        )
        emit(*args, **kwargs)
        Notification.objects.filter(pk__gt=high_water).update(created_at=when)

    def _write_comment(self, ticket, author, when, body, status_then="in_progress"):
        """Write one comment with the trail row and notification the view writes.

        `status_then` is the ticket's status when the comment was posted, which
        decides whether its requester was told; the ticket object already holds
        its final status.
        """
        comment = TicketComment.objects.create(
            ticket=ticket, author=author, body=body
        )
        TicketComment.objects.filter(pk=comment.pk).update(created_at=when)
        self._log(
            ticket, when, event_type="comment_added",
            actor=author, to_value=str(comment.pk),
        )
        final_status, ticket.status = ticket.status, status_then
        try:
            self._notify(when, emit_comment_added, ticket, comment)
        finally:
            ticket.status = final_status
        return comment

    def _write_history(self, ticket, technician, created_at, rng, hos, now):
        """Write the trail, working log and feed the ticket's status implies.

        Every moment is stamped as it happened, and none later than now (`by_now`).
        """
        self._log(
            ticket, created_at, event_type="created",
            actor=ticket.raised_by, to_value=ticket.ticket_no,
        )
        self._notify(created_at, emit_ticket_created, ticket)
        if ticket.status == "open":
            return

        response_window = timedelta(minutes=ticket.priority.response_minutes)
        if rng.random() < 0.85:
            assigned_at = created_at + response_window * rng.uniform(0.1, 0.9)
        else:
            assigned_at = created_at + response_window * rng.uniform(1.2, 3.0)
        assigned_at = by_now(created_at, assigned_at, now, rng)

        # Two ways a ticket reaches a technician, and the trail says which. A
        # claim takes it straight to in progress at Low; a ticket still at
        # assigned, or one with a real priority, was handed over by the HOS.
        claimable = ticket.status != "assigned" and ticket.priority.name == "Low"
        claimed = claimable and rng.random() < 0.4
        if claimed:
            # `claim_ticket`: the assignment and both hops in one moment, one message.
            self._log(
                ticket, assigned_at, event_type="assigned", actor=technician,
                to_value=display_name(technician),
            )
            for old, new in (("open", "assigned"), ("assigned", "in_progress")):
                self._log(
                    ticket, assigned_at, event_type="status_changed", actor=technician,
                    from_value=old, to_value=new,
                )
            self._notify(assigned_at, emit_ticket_assigned, ticket, technician, claimed=True)
            started_at = assigned_at
        else:
            # `assign_ticket`: the HOS sets the real priority as they hand it over.
            handover = rng.choice(HANDOVER_NOTES) if rng.random() < 0.5 else ""
            if ticket.priority.name != "Low":
                self._log(
                    ticket, assigned_at - timedelta(seconds=1), event_type="priority_changed",
                    actor=hos, from_value="Low", to_value=ticket.priority.name,
                )
            self._log(
                ticket, assigned_at, event_type="assigned", actor=hos,
                to_value=display_name(technician), reason=handover,
            )
            self._notify(assigned_at, emit_ticket_assigned, ticket, hos, note=handover)

            if ticket.status == "assigned":
                return

            started_at = by_now(
                assigned_at, assigned_at + timedelta(minutes=rng.randint(5, 240)), now, rng
            )
            self._log(
                ticket, started_at, event_type="status_changed", actor=technician,
                from_value="assigned", to_value="in_progress",
            )
        if not claimed:
            # A claim's one message already said work had started. Some starts
            # carry a progress note, which goes to the requester.
            progress = rng.choice(PROGRESS_NOTES) if rng.random() < 0.4 else ""
            self._notify(
                started_at, emit_ticket_status_changed, ticket, technician, "assigned",
                new_status="in_progress", note=progress,
            )

        if ticket.status == "pending":
            # Weighted: a maintenance section is stopped by parts far more often than by
            # anything else.
            reason = rng.choices(list(PENDING_NOTES), weights=[30, 24, 16, 14, 9, 7])[0]
            # After work started, or the trail reads "held" before "in progress".
            paused_at = by_now(started_at, started_at + timedelta(hours=rng.randint(1, 12)), now, rng)
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
            self._notify(
                paused_at, emit_ticket_status_changed, ticket, technician, "in_progress",
                new_status="pending",
                note=PENDING_NOTES[reason], hold_reason=PENDING_REASON_LABELS[reason],
            )

        resolved_at = None
        if ticket.status in TERMINAL_STATUSES:
            # Most finish inside the ticket's own resolution window, some late.
            window = timedelta(minutes=ticket.priority.resolution_minutes)
            if rng.random() < 0.78:
                resolved_at = created_at + window * rng.uniform(0.2, 0.95)
            else:
                resolved_at = created_at + window * rng.uniform(1.1, 2.5)
            # Work takes time once started, however short the window.
            resolved_at = max(resolved_at, started_at + timedelta(minutes=rng.randint(30, 240)))
            resolved_at = by_now(started_at, resolved_at, now, rng)
            Ticket.objects.filter(pk=ticket.pk).update(resolved_at=resolved_at)

        self._write_working_log(
            ticket, technician, hos, started_at, resolved_at, rng, now
        )

        if resolved_at is not None:
            # Picked by pk, not drawn: an extra draw would shift every later one.
            resolution_note = COMPLETION_NOTES[ticket.pk % len(COMPLETION_NOTES)]
            self._log(
                ticket, resolved_at, event_type="resolved", actor=technician,
                from_value="in_progress", to_value="resolved", reason=resolution_note,
            )
            self._notify(
                resolved_at, emit_ticket_resolved, ticket, technician, note=resolution_note,
            )

        # Rating closes a ticket, so only closed ones carry a rating; a resolved
        # one is still waiting on its requester.
        rated_at = None
        if ticket.status == "closed":
            closed_at = by_now(resolved_at, resolved_at + timedelta(hours=rng.randint(2, 48)), now, rng)
            Ticket.objects.filter(pk=ticket.pk).update(closed_at=closed_at)
            self._log(
                ticket, closed_at, event_type="closed", actor=ticket.raised_by,
                from_value="resolved", to_value="closed",
            )
            self._notify(
                closed_at, emit_ticket_status_changed, ticket, ticket.raised_by, "resolved",
                new_status="closed",
            )
            rated_at = closed_at

        if rated_at is not None and rng.random() < 0.7:
            rating = rng.choices([2, 3, 4, 5], weights=[1, 2, 4, 5])[0]
            comment = rng.choice(RATING_COMMENTS[rating]) if rng.random() < 0.55 else ""
            Ticket.objects.filter(pk=ticket.pk).update(
                rating=rating, rating_comment=comment, rated_at=rated_at,
            )
            # `rate_ticket` logs the rating just before the close it causes.
            self._log(
                ticket, rated_at - timedelta(seconds=1), event_type="rated",
                actor=ticket.raised_by, to_value=str(rating),
            )

    def _write_working_log(
        self, ticket, technician, hos, started_at, resolved_at, rng, now
    ):
        """Comment the worked ticket, always before it settles.

        Comments close permanently when the ticket does, so the moment matters.
        """
        if resolved_at is not None:
            when = started_at + (resolved_at - started_at) * rng.uniform(0.5, 0.95)
            self._write_comment(
                ticket, technician, when, rng.choice(COMPLETION_NOTES)
            )
            return

        # Still live: a progress note, and now and then the HOS chasing it.
        def status_at(when):
            paused = Ticket.objects.filter(pk=ticket.pk).values_list("paused_at", flat=True).first()
            return "pending" if paused is not None and when >= paused else "in_progress"

        when = by_now(started_at, started_at + timedelta(minutes=rng.randint(10, 180)), now, rng)
        self._write_comment(
            ticket, technician, when, rng.choice(PROGRESS_NOTES), status_at(when),
        )
        if hos is not None and rng.random() < 0.35:
            when = by_now(started_at, started_at + timedelta(hours=rng.randint(4, 30)), now, rng)
            self._write_comment(
                ticket, hos, when, rng.choice(SUPERVISOR_NOTES), status_at(when),
            )
