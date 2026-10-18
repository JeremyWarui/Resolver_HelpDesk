"""Escalation — technician → HOS → HOD as a ticket ages past its thresholds.

Paused time does not count toward the threshold, and a vacant post is skipped
rather than escalated to.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import RoleAssignment
from tests import factories

pytestmark = pytest.mark.django_db


def age_past(ticket, threshold):
    """Backdate a ticket to just past one of its own priority's thresholds.

    The minutes are read off the priority, so retuning the SLA policy cannot
    quietly stop these tests from testing escalation.
    """
    return factories.age_ticket(
        ticket, minutes=getattr(ticket.priority, threshold) + 1
    )


def test_a_fresh_ticket_does_not_escalate(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
):
    assert (
        factories.escalate(nrb_electrical_ticket, timezone.now())
        is False
    )
    assert nrb_electrical_ticket.current_level == "technician"


def test_ticket_escalates_to_hos_after_the_first_threshold(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
):
    age_past(nrb_electrical_ticket, "escalate_to_hos_minutes")
    assert (
        factories.escalate(nrb_electrical_ticket, timezone.now())
        is True
    )
    assert nrb_electrical_ticket.current_level == "hos"


def test_ticket_escalates_on_to_hod(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
    nrb_hod,
):
    """One level per pass: past the first threshold it reaches the HOS, and
    only once past the second does it go on to the HOD."""
    age_past(nrb_electrical_ticket, "escalate_to_hos_minutes")
    factories.escalate(nrb_electrical_ticket, timezone.now())
    assert nrb_electrical_ticket.current_level == "hos"

    age_past(nrb_electrical_ticket, "escalate_to_hod_minutes")
    factories.escalate(nrb_electrical_ticket, timezone.now())
    assert nrb_electrical_ticket.current_level == "hod"


def test_a_ticket_already_at_hod_does_not_escalate_further(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
    nrb_hod,
):
    nrb_electrical_ticket.current_level = "hod"
    nrb_electrical_ticket.save(update_fields=["current_level"])
    age_past(nrb_electrical_ticket, "escalate_to_hod_minutes")
    assert (
        factories.escalate(nrb_electrical_ticket, timezone.now())
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
    age_past(nrb_electrical_ticket, "escalate_to_hod_minutes")
    assert (
        factories.escalate(nrb_electrical_ticket, timezone.now())
        is False
    )


def test_paused_time_does_not_count_toward_the_threshold(
    nrb_electrical_ticket,
    priorities,
    nrb_hos,
):
    """A ticket parked waiting for parts must not escalate for the wait it was
    told to take."""
    hos_minutes = nrb_electrical_ticket.priority.escalate_to_hos_minutes
    age_past(nrb_electrical_ticket, "escalate_to_hos_minutes")

    # Paused half way to the threshold, so only half the window ever ran, even
    # though the ticket is past it by the wall clock.
    nrb_electrical_ticket.paused_at = nrb_electrical_ticket.created_at + timedelta(
        minutes=hos_minutes // 2
    )
    nrb_electrical_ticket.status = "pending"
    nrb_electrical_ticket.save(update_fields=["paused_at", "status"])

    assert (
        factories.escalate(nrb_electrical_ticket, timezone.now())
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
    sitting at a level nobody is watching.

    Aged past the first threshold only: the HOD's own threshold has not been
    reached, so reaching the HOD here is the skip and nothing else.
    """
    # Vacating the seat is deleting the role row; there is no second place to clear.
    RoleAssignment.objects.filter(role="hos", campus=nrb).delete()
    age_past(nrb_electrical_ticket, "escalate_to_hos_minutes")

    assert (
        factories.escalate(nrb_electrical_ticket, timezone.now())
        is True
    )
    assert nrb_electrical_ticket.current_level == "hod"
