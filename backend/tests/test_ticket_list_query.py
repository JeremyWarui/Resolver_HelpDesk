"""`?search=` and `?ordering=` on /tickets/: they reach every page, never past scope."""

import pytest
from django.urls import reverse

from tests import factories

pytestmark = pytest.mark.django_db


def _page(api, user, **params):
    api.force_authenticate(user)
    response = api.get(reverse("ticket-list"), params)
    assert response.status_code == 200, response.json()
    return response.json()


@pytest.fixture
def many_nrb_tickets(requester, nrb, electrical, priorities):
    """25 tickets: three pages of ten, so page 1 never holds them all."""
    return [
        factories.make_ticket(requester, nrb, electrical, description=f"job {n}")
        for n in range(25)
    ]


def test_search_finds_a_ticket_that_is_not_on_the_first_page(
    api, nrb_hos, many_nrb_tickets
):
    first_page = {r["id"] for r in _page(api, nrb_hos, page_size=10)["results"]}
    wanted = next(t for t in many_nrb_tickets if t.id not in first_page)

    body = _page(api, nrb_hos, page_size=10, search=wanted.ticket_no)

    assert [r["id"] for r in body["results"]] == [wanted.id]
    assert body["count"] == 1


def test_search_matches_the_service_item_and_the_description(
    api, nrb_hos, requester, nrb, electrical, plumbing, priorities
):
    leak = factories.make_ticket(
        requester, nrb, plumbing,
        service_item=factories.make_service_item(plumbing, "Leaking tap"),
    )
    smell = factories.make_ticket(
        requester, nrb, electrical, description="Burning smell by the board"
    )
    factories.make_ticket(requester, nrb, electrical)

    assert {r["id"] for r in _page(api, nrb_hos, search="leaking")["results"]} == {leak.id}
    assert {r["id"] for r in _page(api, nrb_hos, search="burning smell")["results"]} == {smell.id}


def test_search_cannot_reach_a_ticket_outside_scope(
    api, nrb_hos, nrb_electrical_ticket, msa_electrical_ticket
):
    """The Mombasa ticket's own number finds nothing for the Nairobi HOS."""
    body = _page(api, nrb_hos, search=msa_electrical_ticket.ticket_no)

    assert body["results"] == []
    assert body["count"] == 0


def test_search_combines_with_the_filters(
    api, nrb_hos, requester, nrb, electrical, plumbing, priorities
):
    factories.make_ticket(requester, nrb, plumbing, description="socket by the sink")
    wanted = factories.make_ticket(requester, nrb, electrical, description="socket by the door")

    rows = _page(api, nrb_hos, search="socket by", trade=electrical.pk)["results"]

    assert [r["id"] for r in rows] == [wanted.id]


def test_ordering_sorts_every_page_not_just_the_first(api, nrb_hos, many_nrb_tickets):
    seen = []
    for page in (1, 2, 3):
        seen += [r["ticket_no"] for r in _page(
            api, nrb_hos, ordering="ticket_no", page_size=10, page=page
        )["results"]]

    assert seen == sorted(t.ticket_no for t in many_nrb_tickets)


def test_descending_ordering_reverses_it(api, nrb_hos, many_nrb_tickets):
    many_nrb_tickets[0].save()  # the lowest number is now the latest update

    rows = _page(api, nrb_hos, ordering="-ticket_no", page_size=10)["results"]

    assert rows[0]["ticket_no"] == max(t.ticket_no for t in many_nrb_tickets)


def test_ordering_by_trade_uses_the_trade_name(
    api, nrb_hos, requester, nrb, electrical, plumbing, priorities
):
    factories.make_ticket(requester, nrb, electrical)
    factories.make_ticket(requester, nrb, plumbing)  # newest, so first by default

    names = [r["trade"]["name"] for r in _page(api, nrb_hos, ordering="trade__name")["results"]]

    assert names == sorted(names)
    assert names[0] == "Electrical"


def test_tied_rows_keep_one_order_across_pages(api, nrb_hos, many_nrb_tickets):
    """Every row shares one status, so only the id tiebreak keeps the pages
    from repeating one ticket and skipping another."""
    seen = []
    for page in (1, 2, 3):
        seen += [r["id"] for r in _page(
            api, nrb_hos, ordering="status", page_size=10, page=page
        )["results"]]

    assert len(seen) == 25
    assert len(set(seen)) == 25


@pytest.mark.parametrize("field", ["raised_by__password", "contact_phone", "nonsense"])
def test_an_ordering_outside_the_allowed_columns_is_ignored(
    api, nrb_hos, many_nrb_tickets, field
):
    """Sorting by a hidden column would let a caller infer it row by row."""
    default = [r["id"] for r in _page(api, nrb_hos, page_size=25)["results"]]
    asked = [r["id"] for r in _page(api, nrb_hos, page_size=25, ordering=field)["results"]]

    assert asked == default


def test_a_list_row_carries_when_its_clock_last_started(api, nrb_hos, nrb_electrical_ticket):
    """The SLA bar measures from here; a reopened ticket's is the reopen, not the raise."""
    from datetime import timedelta

    from django.utils import timezone

    restarted = timezone.now() - timedelta(hours=1)
    type(nrb_electrical_ticket).objects.filter(pk=nrb_electrical_ticket.pk).update(
        clock_started_at=restarted
    )

    (row,) = _page(api, nrb_hos)["results"]

    assert row["clock_started_at"] == restarted.isoformat().replace("+00:00", "Z")
