"""Shared fixture graph.

Two campuses, one department, one section type, five trades. That is enough to
express every scope boundary this system has, and small enough that a test's
intent is readable from its fixture names.

The graph exists mainly to make the technician boundary testable. A technician
is scoped by `(section, sub_section)` — campus *and* trade — so a suite that
only ever has one campus or one trade will pass while proving nothing.

    NRB ─ Administration ─ Maintenance ─┬─ Electrical  ← nrb_electrician
                                        ├─ Plumbing    ← nrb_plumber
                                        └─ Carpentry, Masonry, Painting
    MSA ─ Administration ─ Maintenance ─┬─ Electrical  ← msa_electrician
                                        └─ …

`nrb_electrician` must not see `msa_electrical_ticket` (wrong campus, right
trade) or `nrb_plumbing_ticket` (right campus, wrong trade). Those two are the
tests that matter; everything else here is scaffolding for them.
"""

import pytest
from rest_framework.test import APIClient

from tests import factories


@pytest.fixture
def api():
    return APIClient()


# ── SLA ───────────────────────────────────────────────────────────────────────


@pytest.fixture
def priorities(db):
    return factories.make_priorities()


@pytest.fixture
def low_priority(priorities):
    return priorities[0]


@pytest.fixture
def critical_priority(priorities):
    return priorities[3]


# ── Org graph ─────────────────────────────────────────────────────────────────


@pytest.fixture
def department(db):
    return factories.make_department()


@pytest.fixture
def nrb(db):
    return factories.make_campus("NRB", "Nairobi")


@pytest.fixture
def msa(db):
    return factories.make_campus("MSA", "Mombasa")


@pytest.fixture
def maintenance(department):
    return factories.make_section_type(department)


@pytest.fixture
def nrb_section(nrb, department, maintenance):
    return factories.make_section(
        factories.make_campus_department(nrb, department), maintenance
    )


@pytest.fixture
def msa_section(msa, department, maintenance):
    return factories.make_section(
        factories.make_campus_department(msa, department), maintenance
    )


@pytest.fixture
def electrical(maintenance):
    return factories.make_sub_section(maintenance, "Electrical", "ELEC")


@pytest.fixture
def plumbing(maintenance):
    return factories.make_sub_section(maintenance, "Plumbing", "PLUMB")


@pytest.fixture
def carpentry(maintenance):
    return factories.make_sub_section(maintenance, "Carpentry", "CARP")


# ── People ────────────────────────────────────────────────────────────────────


@pytest.fixture
def admin_user(db):
    return factories.make_user("admin", role="admin")


@pytest.fixture
def manager(db, department):
    user = factories.make_user("manager", role="manager", department=department)
    department.manager_user = user
    department.save(update_fields=["manager_user"])
    return user


@pytest.fixture
def nrb_hod(nrb, department, nrb_section):
    cd = nrb_section.campus_department
    user = factories.make_user(
        "nrb_hod", campus=nrb, role="hod", campus_department=cd
    )
    cd.head_of_department = user
    cd.save(update_fields=["head_of_department"])
    return user


@pytest.fixture
def nrb_hos(nrb, nrb_section):
    user = factories.make_user("nrb_hos", campus=nrb, role="hos", section=nrb_section)
    nrb_section.hos = user
    nrb_section.save(update_fields=["hos"])
    return user


@pytest.fixture
def msa_hos(msa, msa_section):
    user = factories.make_user("msa_hos", campus=msa, role="hos", section=msa_section)
    msa_section.hos = user
    msa_section.save(update_fields=["hos"])
    return user


@pytest.fixture
def nrb_electrician(nrb_section, electrical):
    return factories.make_technician("nrb_electrician", nrb_section, [electrical])


@pytest.fixture
def nrb_plumber(nrb_section, plumbing):
    return factories.make_technician("nrb_plumber", nrb_section, [plumbing])


@pytest.fixture
def msa_electrician(msa_section, electrical):
    return factories.make_technician("msa_electrician", msa_section, [electrical])


@pytest.fixture
def requester(nrb):
    return factories.make_user("requester", campus=nrb, role="user")


@pytest.fixture
def msa_requester(msa):
    return factories.make_user("msa_requester", campus=msa, role="user")


# ── Places ────────────────────────────────────────────────────────────────────


@pytest.fixture
def facility_types(db):
    """One row per type the validator knows. Every ticket carries a location,
    so nearly every creation test needs at least one of these to exist."""
    from apps.facilities.models import FacilityType
    from apps.facilities.validators import TYPE_SPECS

    return {
        code: FacilityType.objects.create(
            name=code.replace("_", " ").title(), code=code
        )
        for code in TYPE_SPECS
    }


@pytest.fixture
def somewhere(facility_types):
    """The least a ticket can say about where it is.

    Grounds needs no facility row, so this is the payload for tests that must
    supply a location but are not about locations. Tests that care about the
    place build their own.
    """
    return {
        "facility_type": facility_types["grounds"].pk,
        "values": {"zone": "North lawn"},
    }


# ── Tickets ───────────────────────────────────────────────────────────────────


@pytest.fixture
def nrb_electrical_ticket(requester, nrb_section, electrical, priorities):
    return factories.make_ticket(requester, nrb_section, electrical)


@pytest.fixture
def nrb_plumbing_ticket(requester, nrb_section, plumbing, priorities):
    return factories.make_ticket(requester, nrb_section, plumbing)


@pytest.fixture
def msa_electrical_ticket(msa_requester, msa_section, electrical, priorities):
    return factories.make_ticket(msa_requester, msa_section, electrical)
