"""Priority is set at assignment, not chosen from the catalogue.

A ticket opens at Low and the HOS, who has read it and knows the campus's
workload, sets the real priority as they hand it out.
"""

from datetime import timedelta

import pytest
from django.urls import reverse

from tests import factories
from apps.sla.models import Priority
from apps.tickets.models import Ticket, TicketLog

pytestmark = pytest.mark.django_db


def test_new_ticket_opens_at_the_lowest_priority(
    api,
    requester,
    nrb,
    electrical,
    priorities,
    low_priority,
    somewhere,
):
    item = factories.make_service_item(electrical, "Dead socket")
    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"),
        {"service_item": item.pk, "description": "no power", "location": somewhere},
        format="json",
    )
    assert response.status_code == 201, response.json()
    ticket = Ticket.objects.get(pk=response.json()["id"])
    assert ticket.priority_id == low_priority.pk


def test_hos_sets_priority_when_assigning(
    api,
    nrb_hos,
    nrb_electrician,
    nrb_electrical_ticket,
    critical_priority,
):
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk, "priority": critical_priority.pk},
        format="json",
    )
    assert response.status_code == 200
    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.priority_id == critical_priority.pk


def test_priority_change_is_logged(
    api,
    nrb_hos,
    nrb_electrician,
    nrb_electrical_ticket,
    critical_priority,
):
    api.force_authenticate(nrb_hos)
    api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk, "priority": critical_priority.pk},
        format="json",
    )
    log = TicketLog.objects.get(
        ticket=nrb_electrical_ticket, event_type="priority_changed"
    )
    assert log.from_value == "Low"
    assert log.to_value == "Critical"
    assert log.actor_id == nrb_hos.pk


def test_raising_priority_tightens_the_sla_from_creation(
    api,
    nrb_hos,
    nrb_electrician,
    nrb_electrical_ticket,
    critical_priority,
):
    """The clock started when the requester raised it. Re-basing the window on
    the assignment time would hand back the hours the ticket already waited."""
    created_at = nrb_electrical_ticket.created_at
    api.force_authenticate(nrb_hos)
    api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk, "priority": critical_priority.pk},
        format="json",
    )
    nrb_electrical_ticket.refresh_from_db()
    expected = created_at + timedelta(minutes=critical_priority.resolution_minutes)
    assert nrb_electrical_ticket.resolution_due_at == expected


@pytest.mark.parametrize("role", ["nrb_hos", "nrb_electrician", "requester"])
def test_anyone_who_sees_a_ticket_can_read_the_priorities(
    api, request, role, low_priority, critical_priority
):
    """Every ticket view renders a priority badge, and the assignment modal
    fetches this list so the HOS can set the real priority as they hand the
    ticket out. Neither can be admin-only.
    """
    api.force_authenticate(request.getfixturevalue(role))
    response = api.get(reverse("priority-list"))

    assert response.status_code == 200
    names = {row["name"] for row in response.json()["results"]}
    assert {low_priority.name, critical_priority.name} <= names


def test_a_non_admin_still_cannot_change_the_policy(api, nrb_hos, low_priority):
    """Read opened up; write did not. Editing an SLA window silently re-times
    every ticket that carries the priority."""
    response = api.patch(
        reverse("priority-detail", args=[low_priority.pk]),
        {"resolution_minutes": 5},
        format="json",
    )
    assert response.status_code in (401, 403)

    api.force_authenticate(nrb_hos)
    response = api.patch(
        reverse("priority-detail", args=[low_priority.pk]),
        {"resolution_minutes": 5},
        format="json",
    )
    assert response.status_code == 403

    low_priority.refresh_from_db()
    assert low_priority.resolution_minutes != 5


def test_the_set_of_priorities_is_fixed(api, admin_user, low_priority):
    """Not even an admin adds or removes a level.

    A new lowest rank silently becomes `Priority.default()` and changes what
    every new ticket opens at, with nothing on any trail to say so. Deletion is
    refused by `Ticket.priority`'s PROTECT anyway, since a ticket references
    its priority for the life of the record.
    """
    api.force_authenticate(admin_user)

    created = api.post(
        reverse("priority-list"),
        {
            "name": "Zeroth",
            "rank": 0,
            "response_minutes": 1,
            "resolution_minutes": 2,
            "escalate_to_hos_minutes": 1,
            "escalate_to_hod_minutes": 2,
        },
        format="json",
    )
    assert created.status_code == 405
    assert Priority.default().pk == low_priority.pk

    assert api.delete(
        reverse("priority-detail", args=[low_priority.pk])
    ).status_code == 405


@pytest.mark.parametrize(
    "payload,rejected_field",
    [
        ({"escalate_to_hod_minutes": 10}, "escalate_to_hod_minutes"),
        ({"escalate_to_hos_minutes": 99999}, "escalate_to_hod_minutes"),
        ({"resolution_minutes": 5}, "resolution_minutes"),
        ({"response_minutes": 99999}, "resolution_minutes"),
    ],
)
def test_both_threshold_pairs_stay_in_order(
    api, admin_user, low_priority, payload, rejected_field
):
    """Escalation is a sequence, so an HOD threshold under the HOS one is not a
    slow escalation but an unordered one. A resolution target inside the
    response target asks for the job to be done before it is picked up.

    Each case sends one field: a PATCH has to be judged on the row it would
    produce, not on the half it happens to carry.
    """
    api.force_authenticate(admin_user)
    response = api.patch(
        reverse("priority-detail", args=[low_priority.pk]), payload, format="json"
    )

    assert response.status_code == 400, response.json()
    assert rejected_field in response.json()

    before = low_priority.resolution_minutes
    low_priority.refresh_from_db()
    assert low_priority.resolution_minutes == before

