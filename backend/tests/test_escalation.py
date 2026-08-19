"""Escalation — technician → HOS → HOD as a ticket ages past its thresholds.

Escalation is structural, not configurable workflow: the three levels are the
supervisory chain, and a rule only says *when* a priority reaches each rung.

Two behaviours carry the weight. Paused time does not count toward the
threshold, so a ticket waiting on parts cannot escalate for the delay it was
told to take. And a vacant post is skipped rather than escalated *to*, so an
unfilled HOS seat does not swallow the ticket.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.sla.services.escalation import (
    resolve_active_holder,
    run_escalation_for_ticket,
    run_escalations,
)
from apps.tickets.models import TicketLog
from tests import factories

pytestmark = pytest.mark.django_db


# ── Thresholds ────────────────────────────────────────────────────────────────


def test_a_fresh_ticket_does_not_escalate(nrb_electrical_ticket, escalation_rules, nrb_hos):
    assert run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules) is False
    assert nrb_electrical_ticket.current_level == "technician"


def test_ticket_escalates_to_hos_after_the_first_threshold(
    nrb_electrical_ticket, escalation_rules, nrb_hos
):
    factories.age_ticket(nrb_electrical_ticket, days=2)
    assert run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules) is True
    assert nrb_electrical_ticket.current_level == "hos"


def test_ticket_escalates_on_to_hod(nrb_electrical_ticket, escalation_rules, nrb_hos, nrb_hod):
    factories.age_ticket(nrb_electrical_ticket, days=2)
    run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules)
    factories.age_ticket(nrb_electrical_ticket, days=4)
    run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules)
    assert nrb_electrical_ticket.current_level == "hod"


def test_escalation_is_logged_with_the_level_holder(
    nrb_electrical_ticket, escalation_rules, nrb_hos
):
    factories.age_ticket(nrb_electrical_ticket, days=2)
    run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules)
    log = TicketLog.objects.get(ticket=nrb_electrical_ticket, event_type="escalated")
    assert log.from_value == "technician"
    assert log.to_value == "hos"
    assert log.level_user_id == nrb_hos.pk


def test_a_ticket_already_at_hod_does_not_escalate_further(
    nrb_electrical_ticket, escalation_rules, nrb_hos, nrb_hod
):
    nrb_electrical_ticket.current_level = "hod"
    nrb_electrical_ticket.save(update_fields=["current_level"])
    factories.age_ticket(nrb_electrical_ticket, days=30)
    assert run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules) is False


# ── Settled work is left alone ────────────────────────────────────────────────


@pytest.mark.parametrize("status", ["resolved", "closed"])
def test_settled_tickets_never_escalate(nrb_electrical_ticket, escalation_rules, nrb_hos, status):
    nrb_electrical_ticket.status = status
    nrb_electrical_ticket.save(update_fields=["status"])
    factories.age_ticket(nrb_electrical_ticket, days=30)
    assert run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules) is False


def test_paused_time_does_not_count_toward_the_threshold(
    nrb_electrical_ticket, escalation_rules, nrb_hos
):
    """A ticket parked waiting for parts must not escalate for the wait it was
    told to take."""
    factories.age_ticket(nrb_electrical_ticket, days=2)
    nrb_electrical_ticket.paused_at = timezone.now() - timedelta(days=1, hours=12)
    nrb_electrical_ticket.status = "pending"
    nrb_electrical_ticket.save(update_fields=["paused_at", "status"])

    assert run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules) is False
    assert nrb_electrical_ticket.current_level == "technician"


# ── Vacant posts ──────────────────────────────────────────────────────────────


def test_holder_resolves_to_the_section_hos(nrb_section, nrb_hos):
    assert resolve_active_holder(nrb_section, "hos") == nrb_hos


def test_holder_resolves_to_the_campus_hod(nrb_section, nrb_hod):
    assert resolve_active_holder(nrb_section, "hod") == nrb_hod


def test_a_vacant_hos_seat_is_skipped_not_escalated_to(
    nrb_electrical_ticket, escalation_rules, nrb_hod, nrb_section
):
    """With no HOS in post the ticket goes straight to the HOD rather than
    sitting at a level nobody is watching."""
    nrb_section.hos = None
    nrb_section.save(update_fields=["hos"])
    factories.age_ticket(nrb_electrical_ticket, days=3)

    assert run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules) is True
    assert nrb_electrical_ticket.current_level == "hod"


def test_no_supervisors_at_all_means_no_escalation(
    nrb_electrical_ticket, escalation_rules, nrb_section
):
    """Fail closed: nothing to escalate to, so the ticket stays put rather than
    being marked as somebody's problem when it is nobody's."""
    nrb_section.hos = None
    nrb_section.save(update_fields=["hos"])
    cd = nrb_section.campus_department
    cd.head_of_department = None
    cd.save(update_fields=["head_of_department"])
    factories.age_ticket(nrb_electrical_ticket, days=30)

    assert run_escalation_for_ticket(nrb_electrical_ticket, timezone.now(), escalation_rules) is False
    assert nrb_electrical_ticket.current_level == "technician"


# ── The batch runner ──────────────────────────────────────────────────────────


def test_run_escalations_reports_how_many_moved(
    nrb_electrical_ticket, nrb_plumbing_ticket, escalation_rules, nrb_hos
):
    factories.age_ticket(nrb_electrical_ticket, days=2)
    # The plumbing ticket stays fresh, so only one should move.
    assert run_escalations() == 1
    nrb_electrical_ticket.refresh_from_db()
    nrb_plumbing_ticket.refresh_from_db()
    assert nrb_electrical_ticket.current_level == "hos"
    assert nrb_plumbing_ticket.current_level == "technician"


def test_run_escalations_is_idempotent_within_a_threshold_window(
    nrb_electrical_ticket, escalation_rules, nrb_hos
):
    """Running the cron twice in a row must not double-escalate."""
    factories.age_ticket(nrb_electrical_ticket, days=2)
    assert run_escalations() == 1
    assert run_escalations() == 0


# ── The cron entry point ──────────────────────────────────────────────────────


def test_the_escalation_command_escalates_and_reports(
    nrb_electrical_ticket, escalation_rules, nrb_hos
):
    """check_sla has an import-smoke test because a stale import once made cron
    fail silently; this command is the same shape and had none."""
    from io import StringIO

    from django.core.management import call_command

    factories.age_ticket(nrb_electrical_ticket, days=2)
    out = StringIO()
    call_command("process_auto_escalations", stdout=out)

    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.current_level == "hos"
    assert "1 ticket(s)" in out.getvalue()


def test_a_dry_run_reports_the_same_count_and_writes_nothing(
    nrb_electrical_ticket, escalation_rules, nrb_hos
):
    """--dry-run used to print a warning and return, so it could not disagree
    with the real run because it never said anything. Now that it reports, the
    thing worth asserting is that it reports the truth and leaves no trace."""
    from io import StringIO

    from django.core.management import call_command

    factories.age_ticket(nrb_electrical_ticket, days=2)
    out = StringIO()
    call_command("process_auto_escalations", "--dry-run", stdout=out)

    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.current_level == "technician"
    assert not TicketLog.objects.filter(
        ticket=nrb_electrical_ticket, event_type="escalated"
    ).exists()
    assert "1 ticket(s) would escalate" in out.getvalue()
