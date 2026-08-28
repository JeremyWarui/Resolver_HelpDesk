"""The two admin-only reads: the account list and the audit log.

Both sit outside ticket scope on purpose, so each needs a test that a non-admin
gets nothing.
"""

import pytest
from django.urls import reverse

from apps.accounts.identity import display_name
from apps.tickets.models import TicketLog

pytestmark = pytest.mark.django_db


def test_the_account_list_is_admin_only(api, admin_user, nrb_hos):
    """An HOS supervises technicians, not accounts. Reading the roster would
    give them every campus's staff and the post each one holds."""
    url = reverse("user-list")

    api.force_authenticate(nrb_hos)
    assert api.get(url).status_code == 403

    api.force_authenticate(admin_user)
    assert api.get(url).status_code == 200


def test_the_account_list_pages(api, admin_user, nrb, db):
    """The roster pages. An envelope that claims to page and returns the whole
    table arrives in one response every time anyone opens the Users screen.
    """
    from tests import factories

    for n in range(25):
        factories.make_user(f"staffer{n}", campus=nrb)

    api.force_authenticate(admin_user)
    body = api.get(reverse("user-list"), {"page_size": 10}).json()

    assert body["count"] >= 26  # the 25 above, plus the admin
    assert len(body["results"]) == 10
    assert body["next"] is not None


def test_an_account_row_carries_the_post_its_holder_has(
    api,
    admin_user,
    nrb_hos,
    nrb,
):
    """The list is how an admin sees who is what. A row with a name and no role
    is the screen this endpoint exists to draw, minus the only column that
    matters on it."""
    api.force_authenticate(admin_user)
    rows = api.get(reverse("user-list"), {"page_size": 100}).json()["results"]

    row = next(r for r in rows if r["id"] == nrb_hos.pk)
    assert row["role"] == "hos"
    assert row["primary_campus_id"] == nrb.pk
    assert row["home_campus_name"] == nrb.name


def test_the_audit_log_shows_every_ticket_to_an_admin(
    api,
    admin_user,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    """Across campuses, unlike every other ticket read in the system. An audit
    log that respects ticket scope cannot answer the question it exists for."""
    for ticket in (nrb_electrical_ticket, msa_electrical_ticket):
        TicketLog.objects.create(
            ticket=ticket,
            actor=admin_user,
            event_type="status_changed",
            from_value="open",
            to_value="assigned",
        )

    api.force_authenticate(admin_user)
    rows = api.get(reverse("admin-audit-log")).json()["results"]

    numbers = {row["ticket_no"] for row in rows}
    assert {nrb_electrical_ticket.ticket_no, msa_electrical_ticket.ticket_no} <= numbers


def test_an_audit_row_names_who_did_what(api, admin_user, nrb_electrical_ticket):
    """The audit row is a TicketLog row in the same shape as a ticket timeline.

    Name and username both: usernames are email local parts, so most read close
    to a name and some do not, and two people can share a name. The row carries
    the ticket number on top, which is the only thing reading across every
    ticket needs that reading down one does not.
    """
    TicketLog.objects.create(
        ticket=nrb_electrical_ticket,
        actor=admin_user,
        event_type="status_changed",
        from_value="open",
        to_value="assigned",
        reason="taking it on",
    )

    api.force_authenticate(admin_user)
    row = api.get(reverse("admin-audit-log")).json()["results"][0]

    assert row["event_type"] == "status_changed"
    assert row["actor"]["username"] == admin_user.username
    assert row["actor"]["full_name"] == display_name(admin_user)
    assert (row["from_value"], row["to_value"]) == ("open", "assigned")
    assert row["reason"] == "taking it on"
    assert row["ticket_no"] == nrb_electrical_ticket.ticket_no


def test_the_audit_log_is_admin_only(api, nrb_hos, nrb_electrical_ticket):
    """403, like every other admin endpoint. Gating on `user.is_staff` — a flag
    `accounts.posts.assign_role` never writes — would return an empty page to
    the app's own admins and the whole log to anyone made with
    `createsuperuser`.
    """
    TicketLog.objects.create(
        ticket=nrb_electrical_ticket, actor=nrb_hos, event_type="status_changed"
    )

    api.force_authenticate(nrb_hos)
    assert api.get(reverse("admin-audit-log")).status_code == 403
