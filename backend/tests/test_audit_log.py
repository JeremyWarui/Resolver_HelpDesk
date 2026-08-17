"""The audit log is read by people asking "who did this".

A handle like `jkamau` does not answer that without a lookup, so the log reports
the actor's name and carries the username alongside as the stable handle.
"""

import pytest
from django.urls import reverse

from apps.tickets.models import TicketLog

pytestmark = pytest.mark.django_db


@pytest.fixture
def staff_admin(admin_user):
    """AdminAuditLogView gates on is_staff, not on the admin role."""
    admin_user.is_staff = True
    admin_user.first_name = "System"
    admin_user.last_name = "Administrator"
    admin_user.save(update_fields=["is_staff", "first_name", "last_name"])
    return admin_user


@pytest.fixture
def log_entry(nrb_electrician, nrb_electrical_ticket):
    nrb_electrician.first_name = "Esther"
    nrb_electrician.last_name = "Wairimu"
    nrb_electrician.save(update_fields=["first_name", "last_name"])
    return TicketLog.objects.create(
        ticket=nrb_electrical_ticket,
        actor=nrb_electrician,
        event_type="status_changed",
    )


def test_actor_is_the_persons_name_with_the_username_alongside(
    api, staff_admin, log_entry
):
    api.force_authenticate(staff_admin)
    response = api.get(reverse("admin-audit-log"))

    assert response.status_code == 200
    row = next(r for r in response.data["results"] if r["id"] == log_entry.pk)
    assert row["actor"] == "Esther Wairimu"
    assert row["actor_username"] == log_entry.actor.username


def test_actor_falls_back_to_username_when_no_name_is_recorded(
    api, staff_admin, nrb_electrical_ticket, requester
):
    """Seeded accounts have names; imported or scripted ones may not."""
    requester.first_name = ""
    requester.last_name = ""
    requester.save(update_fields=["first_name", "last_name"])
    entry = TicketLog.objects.create(
        ticket=nrb_electrical_ticket, actor=requester, event_type="created"
    )

    api.force_authenticate(staff_admin)
    response = api.get(reverse("admin-audit-log"))

    row = next(r for r in response.data["results"] if r["id"] == entry.pk)
    assert row["actor"] == requester.username


@pytest.mark.parametrize("query", ["Esther", "Wairimu", "esther"])
def test_search_matches_the_name_shown_not_only_the_username(
    api, staff_admin, log_entry, query
):
    """The column shows names, so searching a name has to find its rows."""
    api.force_authenticate(staff_admin)
    response = api.get(reverse("admin-audit-log"), {"actor": query})

    assert response.status_code == 200
    assert log_entry.pk in [r["id"] for r in response.data["results"]]


def test_search_still_matches_the_username(api, staff_admin, log_entry):
    api.force_authenticate(staff_admin)
    response = api.get(reverse("admin-audit-log"), {"actor": log_entry.actor.username})

    assert log_entry.pk in [r["id"] for r in response.data["results"]]
