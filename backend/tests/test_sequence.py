"""Ticket numbers.

Numbers come from a per-campus-department counter held under a row lock, never
from parsing the highest existing `ticket_no`. String ordering would put
`TKT-NRB-ADM-0010` below `TKT-NRB-ADM-0009`, and two simultaneous creates would
read the same maximum and collide on the unique index.

Gaps are fine and expected — the counter only moves forward.
"""

import pytest

from apps.tickets.models import Ticket, TicketSequence
from tests import factories

pytestmark = pytest.mark.django_db


def test_number_encodes_campus_and_department(
    requester, nrb_section, electrical, priorities
):
    ticket = factories.make_ticket(requester, nrb_section, electrical)
    assert ticket.ticket_no.startswith("TKT-NRB-ADM-")


def test_numbers_increment_within_a_campus(
    requester, nrb_section, electrical, priorities
):
    numbers = [
        factories.make_ticket(requester, nrb_section, electrical).ticket_no
        for _ in range(3)
    ]
    assert numbers == ["TKT-NRB-ADM-0001", "TKT-NRB-ADM-0002", "TKT-NRB-ADM-0003"]


def test_each_campus_counts_independently(
    requester, msa_requester, nrb_section, msa_section, electrical, priorities
):
    """Campus is the partition key — Mombasa's first ticket is 0001 even after
    Nairobi has raised several."""
    for _ in range(3):
        factories.make_ticket(requester, nrb_section, electrical)
    msa_first = factories.make_ticket(msa_requester, msa_section, electrical)
    assert msa_first.ticket_no == "TKT-MSA-ADM-0001"


def test_number_survives_the_tenth_ticket(
    requester, nrb_section, electrical, priorities
):
    """The bug string-parsing would introduce: 0010 sorts below 0009."""
    for _ in range(10):
        ticket = factories.make_ticket(requester, nrb_section, electrical)
    assert ticket.ticket_no == "TKT-NRB-ADM-0010"


def test_allocation_moves_forward_even_if_a_ticket_is_deleted(
    requester, nrb_section, electrical, priorities
):
    """A gap is preferable to reissuing a number that appears in someone's
    email, a printed job sheet, or an audit log."""
    first = factories.make_ticket(requester, nrb_section, electrical)
    second = factories.make_ticket(requester, nrb_section, electrical)
    second.delete()
    third = factories.make_ticket(requester, nrb_section, electrical)

    assert first.ticket_no == "TKT-NRB-ADM-0001"
    assert third.ticket_no == "TKT-NRB-ADM-0003"


def test_numbers_are_unique_across_many_creates(
    requester, nrb_section, electrical, plumbing, priorities
):
    tickets = [
        factories.make_ticket(requester, nrb_section, trade)
        for trade in (electrical, plumbing) * 15
    ]
    numbers = [t.ticket_no for t in tickets]
    assert len(set(numbers)) == len(numbers)


def test_counter_seeds_from_existing_tickets(
    requester, nrb_section, electrical, priorities
):
    """A sequence row created after tickets already exist must not restart at 1
    and collide with numbers already issued."""
    factories.make_ticket(requester, nrb_section, electrical)
    factories.make_ticket(requester, nrb_section, electrical)

    TicketSequence.objects.all().delete()

    ticket = factories.make_ticket(requester, nrb_section, electrical)
    assert ticket.ticket_no == "TKT-NRB-ADM-0003"
    assert Ticket.objects.filter(ticket_no=ticket.ticket_no).count() == 1
