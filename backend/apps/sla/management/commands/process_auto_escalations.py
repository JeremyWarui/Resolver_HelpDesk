"""Management command: process automatic ticket escalations.

Delegates to apps.sla.services.escalation. Run periodically (e.g., hourly) via a cron job or task scheduler:
    python manage.py process_auto_escalations

Options:
    --dry-run   Report what would change without writing to the database.
"""

from django.core.management.base import BaseCommand

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
        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(
                self.style.WARNING("DRY RUN MODE — no changes will be made.")
            )
            return

        count = run_escalations()
        self.stdout.write(self.style.SUCCESS(f"Escalated {count} ticket(s)."))
