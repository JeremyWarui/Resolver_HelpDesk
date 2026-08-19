"""Management command: record SLA resolution breaches.

Run every 5 minutes from cron or a process supervisor:
    */5 * * * * /path/to/venv/bin/python manage.py check_sla

A ticket is breached when it is still active, its (pause-aware) `resolution_due_at`
is in the past, and it is NOT currently paused (R9 — a paused ticket's clock is
frozen). Breaches are recorded once as an immutable `TicketLog(event_type=
"sla_breach")`, so the pass is idempotent (a ticket already logged is skipped) and
the breach becomes auditable + available to the analytics `sla_leak` insight.

`at_risk` (approaching deadline) is surfaced live by analytics `aggregate()` and is
intentionally not persisted here.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.tickets.statuses import RUNNING_STATUSES
from apps.notifications.notify import emit_sla_breach
from apps.tickets.models import Ticket, TicketLog


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

        # Running (RUNNING_STATUSES already excludes paused) and past the
        # resolution deadline.
        qs = (
            Ticket.objects.filter(
                status__in=RUNNING_STATUSES,
                resolution_due_at__isnull=False,
                resolution_due_at__lt=now,
            )
            .select_related(
                "section__campus_department__campus",
                "section__campus_department__department",
            )
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
