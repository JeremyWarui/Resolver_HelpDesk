"""Management command: process automatic ticket escalations.

Delegates to apps.tickets.escalation. The server's task runs it every
ESCALATION_INTERVAL_MINUTES with --scheduled (on Windows,
scripts/windows/register-escalation-task.ps1 sets that up); only those runs
tell the SLA Rules page the schedule is alive:
    python manage.py process_auto_escalations --scheduled   # what the task runs
    python manage.py process_auto_escalations               # a run by hand
    python manage.py process_auto_escalations --dry-run     # report, write nothing
"""

from django.core.management.base import BaseCommand

from apps.tickets.escalation import preview, record_run


class Command(BaseCommand):
    help = "Process automatic ticket escalations per the priority's thresholds."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run without making actual changes, just show what would happen.",
        )
        parser.add_argument(
            "--scheduled",
            action="store_true",
            help="Record the run as the server's scheduled task. Only the task passes this.",
        )

    def handle(self, *args, **options):
        if options["dry_run"]:
            moves = preview()
            for ticket, before, after in moves:
                self.stdout.write(f"{ticket.ticket_no}: {before} -> {after}")
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN — {len(moves)} ticket(s) would escalate. Nothing written."
                )
            )
            return

        run = record_run(scheduled=options["scheduled"])
        self.stdout.write(
            self.style.SUCCESS(
                f"Escalated {run.to_hos + run.to_hod} ticket(s): "
                f"{run.to_hos} to the HOS, {run.to_hod} to the HOD."
            )
        )
