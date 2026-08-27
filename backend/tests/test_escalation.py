"""Escalation — technician → HOS → HOD as a ticket ages past its thresholds.

Paused time does not count toward the threshold, and a vacant post is skipped
rather than escalated to.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import RoleAssignment
from apps.sla.escalation import run_escalation_for_ticket
from tests import factories

pytestmark = pytest.mark.django_db


def test_a_fresh_ticket_does_not_escalate(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
):
    assert (
        run_escalation_for_ticket(nrb_electrical_ticket, timezone.now())
        is False
    )
    assert nrb_electrical_ticket.current_level == "technician"


def test_ticket_escalates_to_hos_after_the_first_threshold(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
):
    factories.age_ticket(nrb_electrical_ticket, days=2)
    assert (
        run_escalation_for_ticket(nrb_electrical_ticket, timezone.now())
        is True
    )
    assert nrb_electrical_ticket.current_level == "hos"


def test_ticket_escalates_on_to_hod(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
    nrb_hod,
):
    factories.age_ticket(nrb_electrical_ticket, days=2)
    run_escalation_for_ticket(nrb_electrical_ticket, timezone.now())
    factories.age_ticket(nrb_electrical_ticket, days=4)
    run_escalation_for_ticket(nrb_electrical_ticket, timezone.now())
    assert nrb_electrical_ticket.current_level == "hod"


def test_a_ticket_already_at_hod_does_not_escalate_further(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
    nrb_hod,
):
    nrb_electrical_ticket.current_level = "hod"
    nrb_electrical_ticket.save(update_fields=["current_level"])
    factories.age_ticket(nrb_electrical_ticket, days=30)
    assert (
        run_escalation_for_ticket(nrb_electrical_ticket, timezone.now())
        is False
    )


@pytest.mark.parametrize("status", ["resolved", "closed"])
def test_settled_tickets_never_escalate(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
    status,
):
    nrb_electrical_ticket.status = status
    nrb_electrical_ticket.save(update_fields=["status"])
    factories.age_ticket(nrb_electrical_ticket, days=30)
    assert (
        run_escalation_for_ticket(nrb_electrical_ticket, timezone.now())
        is False
    )


def test_paused_time_does_not_count_toward_the_threshold(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
):
    """A ticket parked waiting for parts must not escalate for the wait it was
    told to take."""
    factories.age_ticket(nrb_electrical_ticket, days=2)
    nrb_electrical_ticket.paused_at = timezone.now() - timedelta(days=1, hours=12)
    nrb_electrical_ticket.status = "pending"
    nrb_electrical_ticket.save(update_fields=["paused_at", "status"])

    assert (
        run_escalation_for_ticket(nrb_electrical_ticket, timezone.now())
        is False
    )
    assert nrb_electrical_ticket.current_level == "technician"


def test_a_vacant_hos_seat_is_skipped_not_escalated_to(
    nrb_electrical_ticket,
    priorities,
    nrb_hod,
    nrb,
):
    """With no HOS in post the ticket goes straight to the HOD rather than
    sitting at a level nobody is watching."""
    # Vacating the seat is deleting the role row; there is no second place to clear.
    RoleAssignment.objects.filter(role="hos", campus=nrb).delete()
    factories.age_ticket(nrb_electrical_ticket, days=3)

    assert (
        run_escalation_for_ticket(nrb_electrical_ticket, timezone.now())
        is True
    )
    assert nrb_electrical_ticket.current_level == "hod"


