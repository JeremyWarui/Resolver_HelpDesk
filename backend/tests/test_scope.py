"""Scope boundaries — what each role may read.

Technician scope is the only two-dimensional one (campus AND trade), and the
dimensions fail differently: a wrong-trade leak only shows up in a suite with
more than one trade. Both are asserted again through the API in
`test_ticket_action_scope.py`.
"""

import pytest
from django.urls import reverse

from apps.accounts.models import TechnicianTrade
from apps.tickets.scope import reporting_ticket_qs, scoped_ticket_qs
from tests import factories

pytestmark = pytest.mark.django_db


def visible(user, role):
    return set(scoped_ticket_qs(user, role).values_list("id", flat=True))


def test_technician_sees_own_campus_and_trade(nrb_electrician, nrb_electrical_ticket):
    assert visible(nrb_electrician, "technician") == {nrb_electrical_ticket.id}


def test_technician_does_not_see_same_trade_at_another_campus(
    nrb_electrician,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    """Right trade, wrong campus. The link row carries the campus, so the one
    for Electrical@Nairobi must not match a ticket in Electrical@Mombasa."""
    assert msa_electrical_ticket.id not in visible(nrb_electrician, "technician")


def test_technician_does_not_see_another_trade_at_own_campus(
    nrb_electrician,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
):
    """Right campus, wrong trade — the boundary a campus-only scope cannot
    see at all.
    """
    assert nrb_plumbing_ticket.id not in visible(nrb_electrician, "technician")


def test_multi_campus_technician_sees_only_assigned_pairs(
    nrb,
    msa,
    electrical,
    plumbing,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
    msa_electrical_ticket,
    requester,
    msa_requester,
):
    """The regression a naive two-`__in` filter would let through: a technician
    holding Electrical at Nairobi and Plumbing at Mombasa must not see the
    Nairobi plumbing ticket.
    """
    tech = factories.make_technician("roving", nrb, [electrical])
    factories.link_technician(tech, msa, plumbing)

    msa_plumbing_ticket = factories.make_ticket(msa_requester, msa, plumbing)

    assert visible(tech, "technician") == {
        nrb_electrical_ticket.id,
        msa_plumbing_ticket.id,
    }


def test_technician_with_no_links_sees_nothing(nrb, nrb_electrical_ticket):
    """Fail closed: a technician role with no trade links grants no access."""
    tech = factories.make_user(
        "unlinked", campus=nrb, role="technician", trades=[]
    )
    assert visible(tech, "technician") == set()


def test_removing_a_trade_link_revokes_access(
    nrb_electrician,
    nrb_electrical_ticket,
    nrb,
    electrical,
):
    TechnicianTrade.objects.filter(
        user=nrb_electrician, campus=nrb, trade=electrical
    ).delete()
    assert visible(nrb_electrician, "technician") == set()


def test_hos_sees_every_trade_at_own_campus(
    nrb_hos,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
):
    assert visible(nrb_hos, "hos") == {
        nrb_electrical_ticket.id,
        nrb_plumbing_ticket.id,
    }


def test_hos_does_not_see_another_campus(nrb_hos, msa_electrical_ticket):
    assert msa_electrical_ticket.id not in visible(nrb_hos, "hos")


def test_hod_sees_own_campus_only(
    nrb_hod,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
    msa_electrical_ticket,
):
    assert visible(nrb_hod, "hod") == {
        nrb_electrical_ticket.id,
        nrb_plumbing_ticket.id,
    }


def test_manager_opens_no_ticket_but_reports_on_every_campus(
    manager,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    assert visible(manager, "manager") == set()
    reported = set(reporting_ticket_qs(manager, "manager").values_list("id", flat=True))
    assert reported == {nrb_electrical_ticket.id, msa_electrical_ticket.id}


def test_a_technician_reports_on_their_own_jobs_not_their_whole_trade(
    nrb, electrical, nrb_electrician, requester, priorities
):
    from tests import factories

    colleague = factories.make_technician("elec_two", nrb, [electrical])
    mine = factories.make_ticket(requester, nrb, electrical, assigned_to=nrb_electrician)
    theirs = factories.make_ticket(requester, nrb, electrical, assigned_to=colleague)

    assert {mine.id, theirs.id} <= visible(nrb_electrician, "technician")
    reported = set(
        reporting_ticket_qs(nrb_electrician, "technician").values_list("id", flat=True)
    )
    assert reported == {mine.id}


@pytest.mark.parametrize("role", ["admin", "hos", "hod", "user"])
def test_every_other_role_reports_on_exactly_what_it_can_open(
    request, role, nrb_electrical_ticket, msa_electrical_ticket, nrb_plumbing_ticket
):
    user = {
        "admin": "admin_user",
        "hos": "nrb_hos",
        "hod": "nrb_hod",
        "technician": "nrb_electrician",
        "user": "requester",
    }[role]
    user = request.getfixturevalue(user)
    reported = set(reporting_ticket_qs(user, role).values_list("id", flat=True))
    assert reported == visible(user, role)


def test_requester_sees_only_own_tickets(
    requester,
    msa_requester,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    assert visible(requester, "user") == {nrb_electrical_ticket.id}


def test_admin_sees_everything(
    admin_user,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    assert visible(admin_user, "admin") == {
        nrb_electrical_ticket.id,
        msa_electrical_ticket.id,
    }


@pytest.mark.parametrize("role", [None, "", "superuser", "hos_assistant"])
def test_unknown_role_sees_nothing(role, requester, nrb_electrical_ticket):
    """Fail closed — an unrecognised role claim must not fall through to a
    permissive branch."""
    assert visible(requester, role) == set()


def _listed(api, user, **params):
    from django.urls import reverse

    api.force_authenticate(user)
    response = api.get(reverse("ticket-list"), params)
    assert response.status_code == 200, response.json()
    return {row["id"] for row in response.json()["results"]}


def test_trade_filter_narrows_the_list(
    api,
    nrb_hos,
    electrical,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
):
    assert _listed(api, nrb_hos, trade=electrical.pk) == {
        nrb_electrical_ticket.id
    }


def test_trade_filter_cannot_reach_another_campus(
    api,
    nrb_hos,
    electrical,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    """Same trade, wrong campus — the filter narrows within scope, it does not
    re-open it."""
    assert _listed(api, nrb_hos, trade=electrical.pk) == {
        nrb_electrical_ticket.id
    }


def test_trade_filter_outside_scope_returns_nothing_not_everything(
    api,
    nrb_electrician,
    plumbing,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
):
    """An electrician asking for plumbing gets an empty list — never the
    unfiltered set, which is what a filter applied before scoping would give."""
    assert _listed(api, nrb_electrician, trade=plumbing.pk) == set()


def test_filter_options_offer_only_trades_the_caller_can_see(
    api,
    nrb_electrician,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
):
    """The dropdown is built from the caller's own rows, so it cannot advertise
    a trade whose tickets they would then be refused."""
    from django.urls import reverse

    api.force_authenticate(nrb_electrician)
    options = api.get(reverse("ticket-filter-options")).json()
    assert [row["name"] for row in options["trades"]] == ["Electrical"]


def test_status_active_lists_live_work_only_and_still_narrows(
    api, requester, nrb, electrical, priorities, nrb_hos
):
    from apps.tickets.models import Ticket
    from tests import factories

    by_status = {}
    for status in ("open", "assigned", "in_progress", "pending", "resolved", "closed"):
        ticket = factories.make_ticket(requester, nrb, electrical)
        Ticket.objects.filter(pk=ticket.pk).update(status=status)
        by_status[status] = ticket.pk
    api.force_authenticate(nrb_hos)

    ids = {t["id"] for t in api.get(reverse("ticket-list"), {"status": "active", "page_size": 100}).json()["results"]}

    assert ids == {by_status[s] for s in ("open", "assigned", "in_progress", "pending")}


def test_status_active_never_widens_past_scope(api, msa_hos, requester, nrb, electrical, priorities):
    from tests import factories

    factories.make_ticket(requester, nrb, electrical)
    factories.make_ticket(factories.make_user("msa_requester_two", campus=msa_hos.campus), msa_hos.campus, electrical)
    api.force_authenticate(msa_hos)

    body = api.get(reverse("ticket-list"), {"status": "active"}).json()

    # Their own campus's live ticket, and not Nairobi's.
    assert body["count"] == 1


def test_a_list_row_says_when_its_hold_began(api, requester, nrb, electrical, priorities):
    from django.utils import timezone

    from apps.tickets.models import Ticket
    from tests import factories

    held = factories.make_ticket(requester, nrb, electrical)
    when = timezone.now()
    Ticket.objects.filter(pk=held.pk).update(status="pending", paused_at=when)
    api.force_authenticate(requester)

    [row] = api.get(reverse("ticket-list"), {"mine": 1}).json()["results"]

    assert row["paused_at"] is not None
