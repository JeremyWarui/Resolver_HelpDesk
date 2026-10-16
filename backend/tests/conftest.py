"""Shared fixture graph. A technician is scoped by the (campus, trade)
pairs they hold, so one campus or one trade would prove nothing.

    NRB ─┬─ Electrical  ← nrb_electrician
         └─ Plumbing    ← nrb_plumber
    MSA ─── Electrical  ← msa_electrician

`nrb_electrician` must not see `msa_electrical_ticket` (wrong campus, right
trade) or `nrb_plumbing_ticket` (right campus, wrong trade).
"""

import pytest
from rest_framework.test import APIClient

from tests import factories


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def priorities(db):
    return factories.make_priorities()


@pytest.fixture
def low_priority(priorities):
    return priorities[0]


@pytest.fixture
def critical_priority(priorities):
    return priorities[3]


@pytest.fixture
def nrb(db):
    return factories.make_campus("NRB", "Nairobi")


@pytest.fixture
def msa(db):
    return factories.make_campus("MSA", "Mombasa")


@pytest.fixture
def electrical(db):
    return factories.make_trade("Electrical", "ELEC")


@pytest.fixture
def plumbing(db):
    return factories.make_trade("Plumbing", "PLUMB")


@pytest.fixture
def admin_user(db):
    return factories.make_user("admin", role="admin")


@pytest.fixture
def manager(db):
    return factories.make_user("manager", role="manager")


@pytest.fixture
def nrb_hod(nrb):
    return factories.make_user("nrb_hod", campus=nrb, role="hod")


@pytest.fixture
def nrb_hos(nrb):
    return factories.make_user("nrb_hos", campus=nrb, role="hos")


@pytest.fixture
def msa_hos(msa):
    return factories.make_user("msa_hos", campus=msa, role="hos")


@pytest.fixture
def nrb_electrician(nrb, electrical):
    return factories.make_technician("nrb_electrician", nrb, [electrical])


@pytest.fixture
def nrb_plumber(nrb, plumbing):
    return factories.make_technician("nrb_plumber", nrb, [plumbing])


@pytest.fixture
def msa_electrician(msa, electrical):
    return factories.make_technician("msa_electrician", msa, [electrical])


@pytest.fixture
def requester(nrb):
    return factories.make_user("requester", campus=nrb, role="user")


@pytest.fixture
def msa_requester(msa):
    return factories.make_user("msa_requester", campus=msa, role="user")


@pytest.fixture
def facility_types(db):
    """One row per facility type. Every ticket carries a location, so nearly
    every creation test needs at least one of these to exist."""
    from apps.facilities.models import FACILITY_TYPES, FacilityType

    return {
        code: FacilityType.objects.create(name=name, code=code)
        for code, name in FACILITY_TYPES.items()
    }


@pytest.fixture
def somewhere(facility_types, nrb):
    """A location payload at Nairobi, for tests that must supply one but are
    not about locations."""
    from apps.facilities.models import Facility

    facility = Facility.objects.create(
        campus=nrb, facility_type=facility_types["grounds"], name="North Lawn"
    )
    return {"facility": facility.pk, "detail": "By the gate"}


@pytest.fixture
def nrb_electrical_ticket(requester, nrb, electrical, priorities):
    return factories.make_ticket(requester, nrb, electrical)


@pytest.fixture
def nrb_plumbing_ticket(requester, nrb, plumbing, priorities):
    return factories.make_ticket(requester, nrb, plumbing)


@pytest.fixture
def msa_electrical_ticket(msa_requester, msa, electrical, priorities):
    return factories.make_ticket(msa_requester, msa, electrical)


