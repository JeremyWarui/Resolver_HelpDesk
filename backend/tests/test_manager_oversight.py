"""The manager oversees the estate; the manager does not work tickets.

A manager's scope is every campus, which makes them the one role where read
access and write authority have to be pulled apart deliberately. `HOD` and
`HOS` see less and may do more; the manager sees everything and may do nothing
to it. The work is held and moved by the HOS who staffs it.

Every 403 below is therefore a *role* refusal, not a scope refusal — the
manager is fully in scope for these tickets, which is exactly why the role gate
has to exist. `test_a_manager_can_read_the_ticket_they_may_not_touch` is the
test that proves that distinction: without it, every 403 here would still pass
if scoping silently broke and the manager could see nothing at all.
"""

import pytest
from django.urls import reverse

from apps.common.roles import (
    ANALYTICS_ROLES,
    OVERSIGHT_ROLES,
    STAFF_ROLES,
    TICKET_SUPERVISOR_ROLES,
)

pytestmark = pytest.mark.django_db


# ── The role sets themselves ──────────────────────────────────────────────────
#
# Cheap, and they catch the two ways this split has actually been got wrong:
# a single-element tuple written without its comma (a plain string, where
# `"man" in OVERSIGHT_ROLES` is True), and a role landing in both halves.


def test_every_role_set_is_a_tuple_not_a_bare_string():
    """`("manager")` is a string. `("manager",)` is the tuple that was meant.

    Both support `in`, so the mistake is invisible until a substring matches
    and a role gate opens for a role that does not exist.
    """
    for name, value in [
        ("TICKET_SUPERVISOR_ROLES", TICKET_SUPERVISOR_ROLES),
        ("OVERSIGHT_ROLES", OVERSIGHT_ROLES),
        ("ANALYTICS_ROLES", ANALYTICS_ROLES),
        ("STAFF_ROLES", STAFF_ROLES),
    ]:
        assert isinstance(value, tuple), f"{name} is {type(value).__name__}, not a tuple"


def test_a_manager_may_oversee_but_never_act():
    assert "manager" in OVERSIGHT_ROLES
    assert "manager" in ANALYTICS_ROLES
    assert "manager" not in TICKET_SUPERVISOR_ROLES
    assert "manager" not in STAFF_ROLES


def test_oversight_and_ticket_authority_do_not_overlap():
    assert not set(OVERSIGHT_ROLES) & set(TICKET_SUPERVISOR_ROLES)


# ── Reading: allowed, and estate-wide ─────────────────────────────────────────


def test_a_manager_can_read_the_ticket_they_may_not_touch(
    api, manager, nrb_electrical_ticket
):
    """The control for every 403 below: in scope, and still refused."""
    api.force_authenticate(manager)
    response = api.get(reverse("ticket-detail", args=[nrb_electrical_ticket.pk]))
    assert response.status_code == 200


def test_a_manager_reads_both_campuses(
    api, manager, nrb_electrical_ticket, msa_electrical_ticket
):
    api.force_authenticate(manager)
    body = api.get(reverse("ticket-list")).json()
    ids = {row["id"] for row in body["results"]}
    assert {nrb_electrical_ticket.pk, msa_electrical_ticket.pk} <= ids


# ── Lifecycle: refused ────────────────────────────────────────────────────────


def test_a_manager_cannot_change_a_ticket_status(
    api, manager, nrb_electrical_ticket, nrb_electrician
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "assigned"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])

    api.force_authenticate(manager)
    response = api.post(
        reverse("ticket-status", args=[nrb_electrical_ticket.pk]),
        {"status": "in_progress"},
        format="json",
    )
    assert response.status_code == 403
    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.status == "assigned"


def test_a_manager_cannot_assign_a_ticket(
    api, manager, nrb_electrical_ticket, nrb_electrician
):
    api.force_authenticate(manager)
    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )
    assert response.status_code == 403
    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.assigned_to_id is None


def test_a_manager_cannot_claim_a_ticket(api, manager, nrb_electrical_ticket):
    api.force_authenticate(manager)
    response = api.post(reverse("ticket-claim", args=[nrb_electrical_ticket.pk]))
    assert response.status_code == 403


def test_a_manager_cannot_delete_someone_elses_attachment(
    api, manager, requester, nrb_electrical_ticket, settings, tmp_path
):
    """Deleting another person's evidence is a supervisor action, not oversight."""
    settings.MEDIA_ROOT = str(tmp_path)
    from tests.test_attachments import an_image

    api.force_authenticate(requester)
    upload = api.post(
        reverse("ticket-attachments", args=[nrb_electrical_ticket.pk]),
        {"files": an_image()},
        format="multipart",
    )
    assert upload.status_code == 201
    (row,) = upload.data

    api.force_authenticate(manager)
    response = api.delete(
        reverse("ticket-attachment-detail", args=[nrb_electrical_ticket.pk, row["id"]])
    )
    assert response.status_code == 403
    assert nrb_electrical_ticket.attachments.count() == 1


# ── Analytics: allowed ────────────────────────────────────────────────────────
#
# These two endpoints gate on the analytics role set. Splitting the ticket
# supervisors out of it once locked the manager out of the only screens the
# role exists for, and nothing failed — the two views are the manager's whole
# reason to log in.


@pytest.mark.parametrize(
    "route", ["analytics:performance-facilities", "analytics:performance-trade-mix"]
)
def test_a_manager_reaches_the_supervising_analytics(api, manager, route):
    api.force_authenticate(manager)
    assert api.get(reverse(route)).status_code == 200


@pytest.mark.parametrize(
    "route", ["analytics:performance-facilities", "analytics:performance-trade-mix"]
)
def test_a_technician_does_not(api, nrb_electrician, route):
    api.force_authenticate(nrb_electrician)
    assert api.get(reverse(route)).status_code == 403
