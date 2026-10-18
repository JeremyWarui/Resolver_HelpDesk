"""The ticket row itself: its number, its location, and its rating.

All three are columns on Ticket: the number is allocated once and stays
stable, the location comes back nested, and a rating is one per ticket and
bounded.
"""

import re

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.tickets.lifecycle import transition_status
from apps.tickets.models import Ticket
from tests import factories

pytestmark = pytest.mark.django_db

TICKET_NO = re.compile(r"^TKT-[A-Z]{2,10}-\d{5}$")


def test_the_ticket_number_names_the_campus_and_is_unique(
    requester, msa_requester, nrb, msa, electrical, priorities
):
    """The number is allocated from the pk the insert hands back, so it is
    unique by construction."""
    nairobi = factories.make_ticket(requester, nrb, electrical)
    mombasa = factories.make_ticket(msa_requester, msa, electrical)

    assert TICKET_NO.match(nairobi.ticket_no), nairobi.ticket_no
    assert nairobi.ticket_no.startswith(f"TKT-{nrb.code.upper()}-")
    assert mombasa.ticket_no.startswith(f"TKT-{msa.code.upper()}-")
    assert nairobi.ticket_no != mombasa.ticket_no


def test_the_ticket_number_survives_every_later_save(
    nrb_electrical_ticket, nrb_electrician
):
    """It is on the row, so a save that touches other columns must not
    reallocate it — the number is what people quote."""
    ticket = nrb_electrical_ticket
    original = ticket.ticket_no

    ticket.assigned_to = nrb_electrician
    ticket.save(update_fields=["assigned_to"])
    transition_status(ticket, "assigned", nrb_electrician)
    transition_status(ticket, "in_progress", nrb_electrician)

    ticket.refresh_from_db()
    assert ticket.ticket_no == original


def test_a_rating_shows_on_the_ticket_it_belongs_to(
    api, requester, nrb_electrician, nrb_electrical_ticket
):
    """`has_feedback` on the list row and the rating itself on the detail —
    both read the ticket's own columns, so the flag cannot disagree with it."""
    ticket = nrb_electrical_ticket
    ticket.assigned_to = nrb_electrician
    ticket.save(update_fields=["assigned_to"])
    for status in ("assigned", "in_progress", "resolved"):
        transition_status(ticket, status, nrb_electrician)

    api.force_authenticate(requester)
    assert api.get(reverse("ticket-list")).json()["results"][0]["has_feedback"] is False

    api.post(
        reverse("ticket-feedback", args=[ticket.pk]),
        {"rating": 4, "comment": "Sorted the same morning."},
        format="json",
    )

    detail = api.get(reverse("ticket-detail", args=[ticket.pk])).json()
    assert detail["has_feedback"] is True
    assert detail["feedback"]["rating"] == 4
    assert detail["feedback"]["comment"] == "Sorted the same morning."
    assert api.get(reverse("ticket-list")).json()["results"][0]["has_feedback"] is True


@pytest.mark.parametrize("rating", [0, 6])
def test_a_rating_outside_one_to_five_is_refused_by_the_database(
    nrb_electrical_ticket, rating
):
    """The view validates it, but the constraint is what actually holds: no
    caller here runs full_clean(), so the field validators never fire."""
    with pytest.raises(IntegrityError), transaction.atomic():
        Ticket.objects.filter(pk=nrb_electrical_ticket.pk).update(rating=rating)
