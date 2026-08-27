"""Management command: process automatic ticket escalations.

Delegates to apps.sla.escalation. Run hourly from cron:
    python manage.py process_auto_escalations
    python manage.py process_auto_escalations --dry-run   # report, write nothing
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.sla.escalation import run_escalations


class Command(BaseCommand):
    help = "Process automatic ticket escalations per the priority's thresholds."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run without making actual changes, just show what would happen.",
        )

    def handle(self, *args, **options):
        if options["dry_run"]:
            # Run the real thing and roll it back, so a dry run cannot disagree with the
            # run it predicts.
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
