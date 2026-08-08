"""The catalogue, and the routing it drives.

Picking a service item is the only routing decision a requester makes.
Everything else — which section handles it, which trade, which campus — is
derived server-side from that one choice plus the requester's own campus.
"""

import pytest
from django.urls import reverse

from apps.org.models import Section, ServiceItem
from apps.org.services.visibility import get_visible_sub_sections
from apps.tickets.models import Ticket
from apps.tickets.services.routing import ServiceNotAvailableError, resolve_routing
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def socket(electrical):
    return factories.make_service_item(electrical, "Faulty socket")


# ── Routing ───────────────────────────────────────────────────────────────────


def test_routing_lands_on_the_requesters_own_campus(
    socket, nrb_section, msa_section, nrb
):
    assert resolve_routing(nrb.id, socket) == nrb_section


def test_the_same_item_routes_elsewhere_for_another_campus(
    socket, nrb_section, msa_section, msa
):
    """Trades are global; the section that handles them is per campus."""
    assert resolve_routing(msa.id, socket) == msa_section


def test_routing_fails_when_the_campus_runs_no_maintenance(socket, nrb_section, db):
    lonely = factories.make_campus("KSM", "Kisumu")
    with pytest.raises(ServiceNotAvailableError):
        resolve_routing(lonely.id, socket)


def test_routing_ignores_an_inactive_section(socket, nrb_section, nrb):
    nrb_section.is_active = False
    nrb_section.save(update_fields=["is_active"])
    with pytest.raises(ServiceNotAvailableError):
        resolve_routing(nrb.id, socket)


def test_routing_is_deterministic(socket, nrb_section, nrb):
    """No `order_by` once meant the result could depend on insertion order."""
    assert {resolve_routing(nrb.id, socket).pk for _ in range(5)} == {nrb_section.pk}


# ── Campus visibility ─────────────────────────────────────────────────────────


def test_visible_trades_are_those_the_campus_runs(nrb, nrb_section, electrical, plumbing):
    codes = {sub.code for sub in get_visible_sub_sections(nrb.id)}
    assert codes == {electrical.code, plumbing.code}


def test_a_campus_with_no_section_offers_nothing(electrical, nrb_section, db):
    lonely = factories.make_campus("KSM", "Kisumu")
    assert list(get_visible_sub_sections(lonely.id)) == []


def test_inactive_trades_are_hidden(nrb, nrb_section, electrical, plumbing):
    electrical.is_active = False
    electrical.save(update_fields=["is_active"])
    codes = {sub.code for sub in get_visible_sub_sections(nrb.id)}
    assert electrical.code not in codes


def test_each_trade_appears_once(nrb, nrb_section, msa_section, electrical):
    """The traversal joins through sections; without `distinct()` a trade would
    repeat per campus running it."""
    subs = list(get_visible_sub_sections(nrb.id))
    assert len(subs) == len({sub.pk for sub in subs})


# ── The catalogue endpoint ────────────────────────────────────────────────────


def test_catalogue_requires_a_campus(api, requester):
    api.force_authenticate(requester)
    assert api.get(reverse("catalog-tree")).status_code == 400


def test_catalogue_nests_items_under_trades(
    api, requester, nrb, nrb_section, electrical, socket
):
    api.force_authenticate(requester)
    response = api.get(reverse("catalog-tree"), {"campus": nrb.id})
    assert response.status_code == 200

    trades = response.json()["results"]
    electrical_row = next(row for row in trades if row["code"] == electrical.code)
    assert socket.name in {item["name"] for item in electrical_row["items"]}


def test_catalogue_exposes_no_priority(
    api, requester, nrb, nrb_section, electrical, socket
):
    """Priority is the HOS's call at assignment, so it has no place here."""
    api.force_authenticate(requester)
    response = api.get(reverse("catalog-tree"), {"campus": nrb.id})
    for trade in response.json()["results"]:
        assert "default_priority" not in trade
        assert all("default_priority" not in item for item in trade["items"])


# ── What creation derives ─────────────────────────────────────────────────────


def test_creating_a_ticket_derives_section_trade_and_campus(
    api, requester, nrb_section, electrical, socket, priorities, somewhere
):
    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"),
        {"service_item": socket.pk, "description": "no power", "location": somewhere},
        format="json",
    )
    assert response.status_code == 201, response.json()

    ticket = Ticket.objects.get(pk=response.json()["id"])
    assert ticket.section_id == nrb_section.pk
    assert ticket.sub_section_id == electrical.pk
    assert ticket.requester_campus_id == nrb_section.campus_department.campus_id


def test_a_user_without_a_campus_cannot_raise_a_ticket(
    api, nrb_section, socket, priorities, db
):
    """Routing has nowhere to start, so fail at creation rather than produce a
    ticket no section owns."""
    stray = factories.make_user("no_campus", campus=None, role="user")
    api.force_authenticate(stray)
    response = api.post(
        reverse("ticket-list"), {"service_item": socket.pk}, format="json"
    )
    assert response.status_code == 400


def test_every_ticket_must_say_where_it_is(
    api, requester, nrb_section, electrical, socket, priorities
):
    """Maintenance work happens somewhere. A ticket the technician cannot find
    is not a ticket, so there is no service for which the question is skipped."""
    api.force_authenticate(requester)
    response = api.post(
        reverse("ticket-list"), {"service_item": socket.pk}, format="json"
    )
    assert response.status_code == 400
    assert "location" in response.json()


def test_service_items_belong_to_exactly_one_trade(electrical, plumbing, socket):
    """The item is what carries the trade, so it cannot be shared between two."""
    field = ServiceItem._meta.get_field("sub_section")
    assert not field.many_to_many
    assert socket.sub_section_id == electrical.pk


def test_section_type_must_match_its_campus_department(nrb, db):
    """R2 — a Maintenance section cannot hang off a department that does not
    own Maintenance."""
    from django.core.exceptions import ValidationError

    other_dept = factories.make_department("ICT", "ICT")
    maintenance = factories.make_section_type()
    section = Section(
        campus_department=factories.make_campus_department(nrb, other_dept),
        section_type=maintenance,
    )
    with pytest.raises(ValidationError):
        section.clean()
