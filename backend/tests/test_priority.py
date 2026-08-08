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
    item = ServiceItem.objects.create(sub_section=electrical, name="Dead socket")
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
