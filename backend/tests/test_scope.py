"""Scope boundaries — what each role may read.

The technician cases are the point of this file. Technician scope is the only
one that is two-dimensional (campus AND trade), and the two dimensions fail
differently: a wrong-campus leak is visible in any multi-campus test, while a
wrong-trade leak only shows up if the suite has more than one trade. Both are
asserted here, and both are asserted again through the API in
`test_ticket_action_scope.py` so a leak cannot hide behind a view.
"""

import pytest

from apps.org.models import SectionTechnician
from apps.tickets.services.scope import scoped_ticket_qs
from tests import factories

pytestmark = pytest.mark.django_db


def visible(user, role):
    return set(scoped_ticket_qs(user, role).values_list("id", flat=True))


# ── Technician: the pair, not the cross product ───────────────────────────────


def test_technician_sees_own_campus_and_trade(
    nrb_electrician, nrb_electrical_ticket
):
    assert visible(nrb_electrician, "technician") == {nrb_electrical_ticket.id}


def test_technician_does_not_see_same_trade_at_another_campus(
    nrb_electrician, nrb_electrical_ticket, msa_electrical_ticket
):
    """Right trade, wrong campus. `Section` carries the campus, so the link row
    for Electrical@Nairobi must not match a ticket in Electrical@Mombasa."""
    assert msa_electrical_ticket.id not in visible(nrb_electrician, "technician")


def test_technician_does_not_see_another_trade_at_own_campus(
    nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """Right campus, wrong trade — the boundary the old section-only scope
    could not see at all."""
    assert nrb_plumbing_ticket.id not in visible(nrb_electrician, "technician")


def test_multi_campus_technician_sees_only_assigned_pairs(
    nrb_section,
    msa_section,
    electrical,
    plumbing,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
    msa_electrical_ticket,
    requester,
    msa_requester,
):
    """The regression that a naive two-`__in` filter would let through.

    A technician who is Electrical@Nairobi and Plumbing@Mombasa matches
    {NRB, MSA} × {Electrical, Plumbing} under a cross-product filter — which
    would hand them Plumbing@Nairobi and Electrical@Mombasa, two pairs they
    were never assigned. Only the two real pairs may be visible.
    """
    tech = factories.make_technician("roving", nrb_section, [electrical])
    factories.link_technician(tech, msa_section, plumbing)

    msa_plumbing_ticket = factories.make_ticket(msa_requester, msa_section, plumbing)

    assert visible(tech, "technician") == {
        nrb_electrical_ticket.id,
        msa_plumbing_ticket.id,
    }


def test_technician_with_no_links_sees_nothing(
    nrb_section, nrb_electrical_ticket, nrb
):
    """Fail closed: a technician role with no trade links grants no access."""
    tech = factories.make_user(
        "unlinked", campus=nrb, role="technician", section=nrb_section
    )
    assert visible(tech, "technician") == set()


def test_removing_a_trade_link_revokes_access(
    nrb_electrician, nrb_electrical_ticket, nrb_section, electrical
):
    SectionTechnician.objects.filter(
        user=nrb_electrician, section=nrb_section, sub_section=electrical
    ).delete()
    assert visible(nrb_electrician, "technician") == set()


# ── HOS: whole section, every trade, one campus ───────────────────────────────


def test_hos_sees_every_trade_in_own_section(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket
):
    assert visible(nrb_hos, "hos") == {
        nrb_electrical_ticket.id,
        nrb_plumbing_ticket.id,
    }


def test_hos_does_not_see_another_campus(nrb_hos, msa_electrical_ticket):
    assert msa_electrical_ticket.id not in visible(nrb_hos, "hos")


# ── HOD: own campus-department ────────────────────────────────────────────────


def test_hod_sees_own_campus_only(
    nrb_hod, nrb_electrical_ticket, nrb_plumbing_ticket, msa_electrical_ticket
):
    assert visible(nrb_hod, "hod") == {
        nrb_electrical_ticket.id,
        nrb_plumbing_ticket.id,
    }


# ── Manager: the department across every campus ───────────────────────────────


def test_manager_sees_all_campuses(
    manager, nrb_electrical_ticket, msa_electrical_ticket
):
    assert visible(manager, "manager") == {
        nrb_electrical_ticket.id,
        msa_electrical_ticket.id,
    }


# ── Requester and fail-closed ─────────────────────────────────────────────────


def test_requester_sees_only_own_tickets(
    requester, msa_requester, nrb_electrical_ticket, msa_electrical_ticket
):
    assert visible(requester, "user") == {nrb_electrical_ticket.id}


def test_admin_sees_everything(
    admin_user, nrb_electrical_ticket, msa_electrical_ticket
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


# ── Narrowing filters ─────────────────────────────────────────────────────────
#
# `?sub_section=` lets an HOS look at one trade at a time. A filter must only
# ever narrow: the scope has already been decided by then, so the interesting
# case is not that it filters but that it cannot be turned into a way to reach
# past the caller's own rows.


def _listed(api, user, **params):
    from django.urls import reverse

    api.force_authenticate(user)
    response = api.get(reverse("ticket-list"), params)
    assert response.status_code == 200, response.json()
    return {row["id"] for row in response.json()["results"]}


def test_trade_filter_narrows_the_list(
    api, nrb_hos, electrical, nrb_electrical_ticket, nrb_plumbing_ticket
):
    assert _listed(api, nrb_hos, sub_section=electrical.pk) == {
        nrb_electrical_ticket.id
    }


def test_trade_filter_cannot_reach_another_campus(
    api, nrb_hos, electrical, nrb_electrical_ticket, msa_electrical_ticket
):
    """Same trade, wrong campus — the filter narrows within scope, it does not
    re-open it."""
    assert _listed(api, nrb_hos, sub_section=electrical.pk) == {
        nrb_electrical_ticket.id
    }


def test_trade_filter_outside_scope_returns_nothing_not_everything(
    api, nrb_electrician, plumbing, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """An electrician asking for plumbing gets an empty list — never the
    unfiltered set, which is what a filter applied before scoping would give."""
    assert _listed(api, nrb_electrician, sub_section=plumbing.pk) == set()


def test_filter_options_offer_only_trades_the_caller_can_see(
    api, nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """The dropdown is built from the caller's own rows, so it cannot advertise
    a trade whose tickets they would then be refused."""
    from django.urls import reverse

    api.force_authenticate(nrb_electrician)
    options = api.get(reverse("ticket-filter-options")).json()
    assert [row["name"] for row in options["sub_sections"]] == ["Electrical"]
