"""IDOR guard — every `/tickets/{pk}/...` sub-endpoint must fail closed.

An out-of-scope ticket returns **403, not 404 and not an empty list**.
`wrong_trade_technician` is out of scope by trade alone, which is the
boundary the other actors here cannot see.
"""

import pytest
from django.urls import reverse

from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def target(nrb_electrical_ticket):
    """The ticket under attack: Electrical @ Nairobi."""
    return nrb_electrical_ticket


@pytest.fixture
def wrong_trade_technician(nrb_plumber):
    """Same campus, wrong trade."""
    return nrb_plumber


@pytest.fixture
def wrong_campus_technician(msa_electrician):
    """Same trade, wrong campus."""
    return msa_electrician


@pytest.fixture
def outsider_hos(msa_hos):
    return msa_hos


@pytest.fixture
def outsider_requester(msa_requester):
    return msa_requester


OUTSIDERS = [
    "wrong_trade_technician",
    "wrong_campus_technician",
    "outsider_hos",
    "outsider_requester",
]


def _act(api, name, ticket, method, **kwargs):
    url = reverse(name, args=[ticket.pk])
    return getattr(api, method)(url, **kwargs)


@pytest.mark.parametrize("actor_fixture", OUTSIDERS)
@pytest.mark.parametrize(
    "name,method,payload",
    [
        ("ticket-detail", "get", None),
        ("ticket-logs", "get", None),
        ("ticket-comments", "get", None),
        ("ticket-attachments", "get", None),
        ("ticket-status", "post", {"status": "in_progress"}),
        ("ticket-claim", "post", {}),
        ("ticket-comments", "post", {"body": "leak"}),
        ("ticket-feedback", "post", {"rating": 5}),
    ],
)
def test_out_of_scope_actions_are_forbidden(
    api,
    request,
    actor_fixture,
    target,
    name,
    method,
    payload,
):
    actor = request.getfixturevalue(actor_fixture)
    api.force_authenticate(actor)
    kwargs = {"data": payload, "format": "json"} if payload is not None else {}
    response = _act(api, name, target, method, **kwargs)
    assert response.status_code == 403, (
        f"{actor_fixture} reached {name} ({method}) on an out-of-scope ticket "
        f"— got {response.status_code}"
    )


@pytest.mark.parametrize("actor_fixture", OUTSIDERS)
def test_out_of_scope_ticket_absent_from_list(api, request, actor_fixture, target):
    actor = request.getfixturevalue(actor_fixture)
    api.force_authenticate(actor)
    response = api.get(reverse("ticket-list"))
    assert response.status_code == 200
    ids = {row["id"] for row in response.json()["results"]}
    assert target.pk not in ids


def test_hos_cannot_assign_a_ticket_to_the_wrong_trade(
    api,
    nrb_hos,
    nrb_plumber,
    target,
):
    """The dropdown and the scope check have to agree.

    If a HOS could assign an Electrical ticket to a plumber, that plumber would
    then get a 403 on a ticket sitting in their own queue — a dead end the UI
    cannot explain.
    """
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[target.pk]),
        {"assigned_to": nrb_plumber.pk},
        format="json",
    )
    assert response.status_code == 400
    assert "assigned_to" in response.json()


def test_hos_can_assign_a_ticket_to_the_right_trade(
    api,
    nrb_hos,
    nrb_electrician,
    target,
):
    api.force_authenticate(nrb_hos)
    response = api.post(
        reverse("ticket-assign", args=[target.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )
    assert response.status_code == 200
    target.refresh_from_db()
    assert target.assigned_to_id == nrb_electrician.pk


def test_hod_can_assign_a_ticket_in_their_own_campus(
    api,
    nrb_hod,
    nrb_electrician,
    target,
):
    """§4 grants the HOD assignment as well as the HOS. Every other assign test
    drives it as an HOS, so this is the one that proves the second half."""
    api.force_authenticate(nrb_hod)
    response = api.post(
        reverse("ticket-assign", args=[target.pk]),
        {"assigned_to": nrb_electrician.pk},
        format="json",
    )
    assert response.status_code == 200
    target.refresh_from_db()
    assert target.assigned_to_id == nrb_electrician.pk


def test_assignable_technicians_list_is_narrowed_by_trade(
    api,
    nrb_hos,
    nrb_electrician,
    nrb_plumber,
    nrb,
    electrical,
):
    """The dropdown has to agree with `scoped_ticket_qs`: offering the plumber
    on an Electrical job produces a 400 the HOS cannot act on."""
    api.force_authenticate(nrb_hos)
    response = api.get(
        reverse("technician-list"),
        {"campus": nrb.pk, "trade": electrical.pk},
    )
    assert response.status_code == 200
    ids = {row["id"] for row in response.json()}
    assert ids == {nrb_electrician.pk}


def test_the_technician_list_never_reaches_another_campus(
    api,
    nrb_hos,
    msa,
    msa_electrician,
    electrical,
):
    """`?campus=` narrows what scope returned; it cannot reach past it."""
    api.force_authenticate(nrb_hos)
    response = api.get(
        reverse("technician-list"),
        {"campus": msa.pk, "trade": electrical.pk},
    )
    assert response.status_code == 200
    assert response.json() == []


def test_technician_with_a_second_trade_reaches_both(
    api,
    nrb,
    electrical,
    plumbing,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
):
    """The positive case for multi-trade technicians — scope narrows, it does
    not simply deny."""
    tech = factories.make_technician("multi", nrb, [electrical, plumbing])
    api.force_authenticate(tech)
    for ticket in (nrb_electrical_ticket, nrb_plumbing_ticket):
        response = api.get(reverse("ticket-detail", args=[ticket.pk]))
        assert response.status_code == 200


@pytest.fixture
def rated_electrical(nrb_electrical_ticket):
    nrb_electrical_ticket.status = "closed"
    nrb_electrical_ticket.save(update_fields=["status"])
    return factories.rate_ticket(nrb_electrical_ticket, 5, "Quick work")


@pytest.fixture
def rated_plumbing(nrb_plumbing_ticket):
    return factories.rate_ticket(nrb_plumbing_ticket, 2)


def _feedback(api, user):
    api.force_authenticate(user)
    response = api.get(reverse("ticket-feedback-list"))
    assert response.status_code == 200, response.json()
    return response.json()["results"]


def test_a_technician_sees_only_their_own_trade(
    api,
    nrb_electrician,
    rated_electrical,
    rated_plumbing,
):
    """A trade's reputation is shared, so this is not "ratings on work I did" —
    but it stops at the trade boundary, exactly as the ticket list does."""
    rows = _feedback(api, nrb_electrician)
    assert [row["ticket_no"] for row in rows] == [rated_electrical.ticket_no]


def test_feedback_requires_authentication(api):
    assert api.get(reverse("ticket-feedback-list")).status_code == 401


def test_escalated_filter_returns_only_tickets_above_the_technician(
    api,
    nrb_hos,
    nrb_electrical_ticket,
    nrb_plumbing_ticket,
):
    nrb_electrical_ticket.current_level = "hos"
    nrb_electrical_ticket.save(update_fields=["current_level"])

    api.force_authenticate(nrb_hos)
    body = api.get(reverse("ticket-list"), {"escalated": "1"}).json()

    assert [t["ticket_no"] for t in body["results"]] == [
        nrb_electrical_ticket.ticket_no
    ]


def test_escalated_filter_narrows_scope_and_never_widens_it(
    api,
    nrb_hos,
    nrb_electrical_ticket,
    msa_electrical_ticket,
):
    """A filter is not a scope. Escalating another campus's ticket must not
    pull it into this HOS's list."""
    for t in (nrb_electrical_ticket, msa_electrical_ticket):
        t.current_level = "hod"
        t.save(update_fields=["current_level"])

    api.force_authenticate(nrb_hos)
    body = api.get(reverse("ticket-list"), {"escalated": "1"}).json()

    assert body["count"] == 1
    assert body["results"][0]["ticket_no"] == nrb_electrical_ticket.ticket_no


def test_a_technician_may_not_assign_a_ticket(
    api,
    nrb_electrician,
    nrb,
    electrical,
    target,
):
    """Working a ticket is not the same authority as handing one out.

    The technician is squarely in scope for this ticket — it is their own
    campus and their own trade — so this is a role refusal, not a scope one.
    Assignment and priority are the HOS's calls (REVIEW.md §4).
    """
    mate = factories.make_technician("nrb_electrician_2", nrb, [electrical])

    api.force_authenticate(nrb_electrician)
    response = api.post(
        reverse("ticket-assign", args=[target.pk]),
        {"assigned_to": mate.pk},
        format="json",
    )

    assert response.status_code == 403
    target.refresh_from_db()
    assert target.assigned_to_id is None

