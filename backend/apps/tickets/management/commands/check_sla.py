"""Management command: record SLA resolution breaches. Run every 5 minutes:
    */5 * * * * /path/to/venv/bin/python manage.py check_sla

Idempotent: a breach is one immutable TicketLog row, and a ticket already
logged is skipped.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.notify import emit_sla_breach
from apps.tickets.models import Ticket, TicketLog
from apps.tickets.sla import q_overdue


class Command(BaseCommand):
    help = "Record SLA resolution breaches and notify the supervisors."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing to the database.",
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="List each breached ticket.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        verbose = options["verbose"]
        now = timezone.now()

        # Passed, not defaulted, so every ticket in a pass shares one instant.
        qs = Ticket.objects.filter(q_overdue(now)).select_related(
            "requester_campus",
        )

        # Idempotency: skip tickets already logged as breached.
        already = set(
            TicketLog.objects.filter(event_type="sla_breach").values_list(
                "ticket_id", flat=True
            )
        )

        count = 0
        for ticket in qs:
            if ticket.id in already:
                continue

            if verbose or dry_run:
                self.stdout.write(
                    f"  {'WOULD breach' if dry_run else 'breach'}: {ticket.ticket_no}"
                )
            if dry_run:
                count += 1
                continue

            TicketLog.objects.create(
                ticket=ticket,
                actor=None,
                event_type="sla_breach",
                reason="Resolution SLA breached",
            )

            emit_sla_breach(ticket)

            count += 1

        label = "[DRY RUN] " if dry_run else ""
        self.stdout.write(
            f"{label}SLA check complete: {count} new breach(es) recorded."
        )
