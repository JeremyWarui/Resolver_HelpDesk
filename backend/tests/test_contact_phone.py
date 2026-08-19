"""A technician on site may need someone to call.

Optional throughout — a missing phone number is not a reason to refuse someone
a repair. It is captured per ticket rather than read from the requester's
profile at display time: the useful contact is often not the requester (a
caretaker, whoever is actually in the room), and editing a profile must not
rewrite the history of a job that closed months ago.
"""

import pytest
from django.urls import reverse

from apps.tickets.models import Ticket
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def item(electrical):
    return factories.make_service_item(electrical, "Dead socket")


@pytest.fixture
def raise_ticket(api, item, somewhere):
    """Post a ticket with the mandatory bits already filled in, so each test
    only has to say what it is actually about."""

    def _raise(**extra):
        return api.post(
            reverse("ticket-list"),
            {
                "service_item": item.pk,
                "description": "no power",
                "location": somewhere,
                **extra,
            },
            format="json",
        )

    return _raise


def test_contact_phone_defaults_to_the_requesters_profile_number(
    api, requester, raise_ticket, nrb_section, priorities
):
    api.force_authenticate(requester)
    response = raise_ticket()
    assert response.status_code == 201, response.json()
    ticket = Ticket.objects.get(pk=response.json()["id"])
    assert ticket.contact_phone == requester.phone_number


def test_requester_can_give_a_different_number(
    api, requester, raise_ticket, nrb_section, priorities
):
    """Raising on behalf of somewhere else — the caretaker is who to call."""
    api.force_authenticate(requester)
    response = raise_ticket(contact_phone="0722 111 222")
    assert response.status_code == 201
    ticket = Ticket.objects.get(pk=response.json()["id"])
    assert ticket.contact_phone == "+254722111222"


@pytest.mark.parametrize(
    "given,stored",
    [
        ("0712 345 678", "+254712345678"),   # the way most people type it
        ("+254-712-345678", "+254712345678"),
        ("254712345678", "+254712345678"),
        ("712345678", "+254712345678"),      # trunk zero omitted
        ("+254 (0) 712 345 678", "+254712345678"),
        ("0110 123 456", "+254110123456"),   # the newer 01 mobile range
        ("(020) 2711000", "+254202711000"),  # Nairobi landline
    ],
)
def test_numbers_are_stored_in_one_dialable_form(
    api, requester, raise_ticket, nrb_section, priorities, given, stored
):
    api.force_authenticate(requester)
    response = raise_ticket(contact_phone=given)
    assert response.status_code == 201
    assert Ticket.objects.get(pk=response.json()["id"]).contact_phone == stored


@pytest.mark.parametrize(
    "given",
    [
        "07123",              # too short for a Kenyan mobile
        "071234567890",       # too long
        "not-a-number",
        "12",
        "+447700900000",      # a UK number — almost always a typo here
        "0912345678",         # 09 is not an allocated Kenyan prefix
    ],
)
def test_unusable_numbers_are_rejected(
    api, requester, raise_ticket, nrb_section, priorities, given
):
    api.force_authenticate(requester)
    response = raise_ticket(contact_phone=given)
    assert response.status_code == 400
    assert "contact_phone" in response.json()


def test_a_user_with_no_number_can_still_raise_a_ticket(
    api, nrb, raise_ticket, nrb_section, priorities
):
    """The number is a convenience for the technician, not a gate on the repair."""
    user = factories.make_user("phoneless", campus=nrb, role="user")
    user.phone_number = ""
    user.save(update_fields=["phone_number"])

    api.force_authenticate(user)
    response = raise_ticket()
    assert response.status_code == 201, response.json()
    assert Ticket.objects.get(pk=response.json()["id"]).contact_phone == ""


def test_blank_is_accepted_when_sent_explicitly(
    api, requester, raise_ticket, nrb_section, priorities
):
    """Clearing the prefilled field in the wizard must not be an error — but it
    still falls back to the profile number, which is the point of the prefill."""
    api.force_authenticate(requester)
    response = raise_ticket(contact_phone="")
    assert response.status_code == 201
    assert (
        Ticket.objects.get(pk=response.json()["id"]).contact_phone
        == requester.phone_number
    )


def test_assignee_sees_the_number_on_the_ticket(
    api, nrb_electrician, nrb_electrical_ticket, requester
):
    api.force_authenticate(nrb_electrician)
    response = api.get(reverse("ticket-detail", args=[nrb_electrical_ticket.pk]))
    assert response.status_code == 200
    assert response.json()["contact_phone"] == requester.phone_number


def test_list_endpoint_does_not_expose_contact_numbers(
    api, nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """One ticket at a time is a technician doing their job; a page of numbers
    is a contact-list export."""
    api.force_authenticate(nrb_hos)
    response = api.get(reverse("ticket-list"))
    assert response.status_code == 200
    rows = response.json()["results"]
    assert rows
    assert all("contact_phone" not in row for row in rows)


def test_editing_a_profile_does_not_rewrite_past_tickets(
    api, requester, nrb_electrical_ticket
):
    original = nrb_electrical_ticket.contact_phone
    requester.phone_number = "0799999999"
    requester.save(update_fields=["phone_number"])

    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.contact_phone == original
