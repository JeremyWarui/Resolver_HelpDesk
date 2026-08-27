"""Self-claim — a technician picking up unassigned work in their own trade.

The interesting case is two technicians tapping "Claim" at the same moment.
`claim_ticket` re-checks the ticket's state *after* the caller has taken the
row lock, so the loser is rejected rather than silently overwriting the winner.

Claiming out of scope is refused by the IDOR matrix in
`test_ticket_action_scope.py`, which walks every sub-endpoint against every
kind of outsider. Only the role refusal is here: a requester is fully in scope
for their own ticket and still may not pick it up.
"""

import pytest
from django.urls import reverse

from apps.tickets.lifecycle import TransitionError, claim_ticket
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


def test_second_claim_loses(api, nrb, electrical, nrb_electrical_ticket):
    """The post-lock re-check is what makes a double claim safe."""
    first = factories.make_technician("elec_one", nrb, [electrical])
    second = factories.make_technician("elec_two", nrb, [electrical])

    api.force_authenticate(first)
    assert claim(api, nrb_electrical_ticket).status_code == 200

    api.force_authenticate(second)
    assert claim(api, nrb_electrical_ticket).status_code == 409

    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.assigned_to_id == first.pk


def test_claim_rejects_an_already_assigned_ticket(
    nrb_electrical_ticket,
    nrb_electrician,
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.save(update_fields=["assigned_to"])
    with pytest.raises(TransitionError):
        claim_ticket(nrb_electrical_ticket, nrb_electrician)


def test_requester_cannot_claim(api, requester, nrb_electrical_ticket):
    api.force_authenticate(requester)
    assert claim(api, nrb_electrical_ticket).status_code == 403
