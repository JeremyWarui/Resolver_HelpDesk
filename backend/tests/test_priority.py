"""Priority is set at assignment, not chosen from the catalogue.

A requester reporting "faulty socket" has no way to know whether it is a dead
bulb or a live wire, and a catalogue default would rate both identically. So a
ticket opens at Low and the HOS — who has read it and knows the section's
workload — sets the real priority as they hand it out.
"""

from datetime import timedelta

import pytest
from django.urls import reverse

from apps.org.models import ServiceItem, SubSection
from tests import factories
from apps.tickets.models import Ticket, TicketLog

pytestmark = pytest.mark.django_db


def test_catalogue_carries_no_priority():
    """A structural guard: re-adding a catalogue priority field would silently
    reintroduce the behaviour this design removed."""
    for model in (SubSection, ServiceItem):
        names = {f.name for f in model._meta.get_fields()}
        assert "default_priority" not in names
        assert "priority" not in names


def test_new_ticket_opens_at_the_lowest_priority(
    api, requester, nrb_section, electrical, priorities, low_priority, somewhere
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
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, critical_priority
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
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, critical_priority
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
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, critical_priority
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


def test_assignment_without_priority_leaves_it_unchanged(
    api, nrb_hos, nrb_electrician, nrb_electrical_ticket, low_priority
):
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )
    assert response.status_code == 200
    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.priority_id == low_priority.pk
    assert not TicketLog.objects.filter(
        ticket=nrb_electrical_ticket, event_type="priority_changed"
    ).exists()


def test_deleting_a_priority_in_use_is_refused_with_a_reason(
    api, admin_user, low_priority, nrb_electrical_ticket
):
    """PROTECT already stops this; the point is that it says so in words.

    The unhandled ProtectedError surfaced as a 500, which tells an admin the
    app is broken rather than that the priority is in use.
    """
    api.force_authenticate(admin_user)
    response = api.delete(reverse("priority-detail", args=[low_priority.pk]))

    assert response.status_code == 409
    assert "cannot be deleted" in response.data["detail"]
    assert "1 ticket" in response.data["detail"]
    low_priority.refresh_from_db()  # still there


def test_an_unused_priority_can_still_be_deleted(api, admin_user, critical_priority):
    api.force_authenticate(admin_user)
    assert not Ticket.objects.filter(priority=critical_priority).exists()

    response = api.delete(reverse("priority-detail", args=[critical_priority.pk]))
    assert response.status_code == 204


# ── Who may read the policy ───────────────────────────────────────────────────


def test_an_hos_can_read_the_priorities(api, nrb_hos, low_priority, critical_priority):
    """The assignment modal fetches this list so the HOS can set the real
    priority as they hand the ticket out. When it was admin-only the request
    404'd into an empty array and the modal drew its "Priority" heading above
    no buttons — the control was in the markup and absent from the screen."""
    api.force_authenticate(nrb_hos)
    response = api.get(reverse("priority-list"))

    assert response.status_code == 200
    names = {row["name"] for row in response.json()["results"]}
    assert {low_priority.name, critical_priority.name} <= names


def test_a_technician_can_read_the_priorities(api, nrb_electrician, low_priority):
    """Every ticket view renders a priority badge, so the vocabulary has to be
    readable by everyone who can see a ticket."""
    api.force_authenticate(nrb_electrician)
    assert api.get(reverse("priority-list")).status_code == 200


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
