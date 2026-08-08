"""Self-claim — a technician picking up unassigned work in their own trade.

The interesting case is two technicians tapping "Claim" at the same moment.
`claim_ticket` re-checks the ticket's state *after* the caller has taken the
row lock, so the loser is rejected rather than silently overwriting the winner.
"""

import pytest
from django.urls import reverse

from apps.tickets.models import Ticket, TicketLog
from apps.tickets.services.lifecycle import TransitionError, claim_ticket
from tests import factories

pytestmark = pytest.mark.django_db


def claim(api, ticket):
    return api.post(reverse("ticket-claim", args=[ticket.pk]))


def test_claim_assigns_and_starts_work(api, nrb_electrician, nrb_electrical_ticket):
    """One tap should leave the ticket assigned *and* in progress — a technician
    who has picked up a job has by definition started it."""
    api.force_authenticate(nrb_electrician)
    assert claim(api, nrb_electrical_ticket).status_code == 200

    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.assigned_to_id == nrb_electrician.pk
    assert nrb_electrical_ticket.status == "in_progress"


def test_claim_writes_the_technician_as_actor(
    api, nrb_electrician, nrb_electrical_ticket
):
    api.force_authenticate(nrb_electrician)
    claim(api, nrb_electrical_ticket)
    log = TicketLog.objects.get(ticket=nrb_electrical_ticket, event_type="assigned")
    assert log.actor_id == nrb_electrician.pk


def test_second_claim_loses(api, nrb_section, electrical, nrb_electrical_ticket):
    """The post-lock re-check is what makes a double claim safe."""
    first = factories.make_technician("elec_one", nrb_section, [electrical])
    second = factories.make_technician("elec_two", nrb_section, [electrical])

    api.force_authenticate(first)
    assert claim(api, nrb_electrical_ticket).status_code == 200

    api.force_authenticate(second)
    assert claim(api, nrb_electrical_ticket).status_code == 409

    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.assigned_to_id == first.pk


def test_claim_rejects_an_already_assigned_ticket(
    nrb_electrical_ticket, nrb_electrician
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.save(update_fields=["assigned_to"])
    with pytest.raises(TransitionError):
        claim_ticket(nrb_electrical_ticket, nrb_electrician)


def test_a_reopened_ticket_becomes_claimable_again(
    api, nrb_electrician, nrb_electrical_ticket
):
    """Reopen clears the assignee, so the next technician can pick it up —
    this is the behaviour that makes `open` mean unassigned."""
    from apps.tickets.services.lifecycle import transition_status

    api.force_authenticate(nrb_electrician)
    claim(api, nrb_electrical_ticket)
    nrb_electrical_ticket.refresh_from_db()

    transition_status(nrb_electrical_ticket, "resolved", actor=nrb_electrician)
    transition_status(nrb_electrical_ticket, "open", actor=nrb_electrician)

    assert claim(api, nrb_electrical_ticket).status_code == 200


def test_technician_cannot_claim_another_trade(
    api, nrb_plumber, nrb_electrical_ticket
):
    """Scope is enforced before the claim logic ever runs."""
    api.force_authenticate(nrb_plumber)
    assert claim(api, nrb_electrical_ticket).status_code == 403


def test_technician_cannot_claim_the_same_trade_at_another_campus(
    api, msa_electrician, nrb_electrical_ticket
):
    api.force_authenticate(msa_electrician)
    assert claim(api, nrb_electrical_ticket).status_code == 403


def test_requester_cannot_claim(api, requester, nrb_electrical_ticket):
    api.force_authenticate(requester)
    assert claim(api, nrb_electrical_ticket).status_code == 403


def test_claim_leaves_other_tickets_untouched(
    api, nrb_electrician, nrb_electrical_ticket, requester, nrb_section, electrical
):
    other = factories.make_ticket(requester, nrb_section, electrical)
    api.force_authenticate(nrb_electrician)
    claim(api, nrb_electrical_ticket)

    other.refresh_from_db()
    assert other.assigned_to_id is None
    assert other.status == "open"
    assert Ticket.objects.filter(status="open", assigned_to=None).count() == 1
