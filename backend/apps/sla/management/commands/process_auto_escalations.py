"""Management command: process automatic ticket escalations.

Delegates to apps.sla.services.escalation. Run periodically (e.g., hourly) via a cron job or task scheduler:
    python manage.py process_auto_escalations

Options:
    --dry-run   Report what would change without writing to the database.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.sla.services.escalation import run_escalations


class Command(BaseCommand):
    help = "Process automatic ticket escalations per EscalationRule thresholds."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run without making actual changes, just show what would happen.",
        )

    def handle(self, *args, **options):
        if options["dry_run"]:
            # Run the real thing and roll it back, rather than reimplementing
            # the threshold logic to preview it. A second copy of that rule is
            # how a dry run starts disagreeing with the run it predicts — and
            # the previous version dodged that by reporting nothing at all.
            with transaction.atomic():
                count = run_escalations()
                transaction.set_rollback(True)
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN — {count} ticket(s) would escalate. Nothing written."
                )
            )
            return

        count = run_escalations()
        self.stdout.write(self.style.SUCCESS(f"Escalated {count} ticket(s)."))
