"""Cover by trade: technicians per (campus, trade), the gaps, and who may read it."""

import pytest
from django.urls import reverse

from apps.accounts.models import CustomUser
from tests import factories

pytestmark = pytest.mark.django_db

URL = "analytics:cover"


def _get(api, user):
    api.force_authenticate(user)
    response = api.get(reverse(URL))
    assert response.status_code == 200, response.content[:300]
    return response.json()


def _cell(data, campus, trade):
    return next(c for c in data["cells"] if c["campus"] == campus.pk and c["trade"] == trade.pk)


@pytest.mark.parametrize("role", ["nrb_electrician", "requester"])
def test_a_technician_or_requester_reads_no_cover(api, request, role):
    api.force_authenticate(request.getfixturevalue(role))
    assert api.get(reverse(URL)).status_code == 403


def test_cover_needs_a_login(api):
    assert api.get(reverse(URL)).status_code == 401


def test_each_cell_counts_the_technicians_whose_pair_matches(
    api, admin_user, nrb, msa, electrical, plumbing, nrb_electrician
):
    both = factories.make_technician("both", nrb, [electrical, plumbing])
    factories.link_technician(both, msa, plumbing)

    data = _get(api, admin_user)

    assert _cell(data, nrb, electrical)["technicians"] == 2
    assert _cell(data, nrb, plumbing)["technicians"] == 1
    assert _cell(data, msa, plumbing)["technicians"] == 1
    # Pairwise: Nairobi electrical and Mombasa plumbing make no Mombasa electrician.
    assert _cell(data, msa, electrical)["technicians"] == 0


def test_every_active_trade_at_every_campus_is_a_cell_and_the_empty_ones_are_gaps(
    api, admin_user, nrb, msa, electrical, plumbing, nrb_electrician, requester, msa_requester, priorities
):
    factories.make_ticket(msa_requester, msa, electrical)
    factories.make_ticket(msa_requester, msa, electrical)
    factories.make_ticket(requester, nrb, electrical)

    data = _get(api, admin_user)

    assert len(data["cells"]) == len(data["campuses"]) * len(data["trades"]) == 4
    assert (data["gaps"], data["gap_campuses"], data["stuck"]) == (3, 2, 2)
    assert _cell(data, msa, electrical)["open"] == 2
    assert _cell(data, nrb, electrical)["open"] == 1


def test_a_retired_trade_has_no_row(api, admin_user, nrb, electrical, plumbing):
    type(plumbing).objects.filter(pk=plumbing.pk).update(is_active=False)

    assert [t["name"] for t in _get(api, admin_user)["trades"]] == ["Electrical"]


def test_a_deactivated_technician_covers_nothing(api, admin_user, nrb, electrical, nrb_electrician):
    CustomUser.objects.filter(pk=nrb_electrician.pk).update(is_active=False)

    data = _get(api, admin_user)

    assert _cell(data, nrb, electrical)["technicians"] == 0
    assert next(c for c in data["campuses"] if c["id"] == nrb.pk)["technicians"] == 0


def test_each_campus_counts_a_technician_once_however_many_trades(api, admin_user, nrb, electrical, plumbing):
    factories.make_technician("both", nrb, [electrical, plumbing])

    data = _get(api, admin_user)

    assert next(c for c in data["campuses"] if c["id"] == nrb.pk)["technicians"] == 1


@pytest.mark.parametrize("role", ["nrb_hos", "nrb_hod"])
def test_a_supervisor_reads_their_own_campus_only(
    api, request, nrb, msa, electrical, msa_electrician, msa_requester, priorities, role
):
    factories.make_ticket(msa_requester, msa, electrical)

    data = _get(api, request.getfixturevalue(role))

    assert [c["name"] for c in data["campuses"]] == ["Nairobi"]
    assert {c["campus"] for c in data["cells"]} == {nrb.pk}
    assert data["stuck"] == 0


def test_the_manager_reads_every_campus(api, manager, nrb, msa, electrical):
    assert {c["name"] for c in _get(api, manager)["campuses"]} == {"Nairobi", "Mombasa"}
