"""IDOR guard — every `/tickets/{pk}/...` sub-endpoint must fail closed.

An out-of-scope ticket has to return **403, not 404 and not an empty list**.
404 would be a fine answer on its own, but the list endpoints already return
empty for out-of-scope tickets; if a sub-endpoint quietly returned 200 with no
data the difference would be invisible in a test that only checked "no rows".

The actor list is the whole point. `wrong_trade_technician` is a technician in
the ticket's own section holding a *different* trade — out of scope by
sub-section alone. Without them, every actor here is out of scope by section
and campus too, and the suite cannot see the sub-section boundary at all.
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
    """Same section, same campus, wrong trade — the boundary that used to be invisible."""
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
    ],
)
def test_out_of_scope_actions_are_forbidden(
    api, request, actor_fixture, target, name, method, payload
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


# ── Assignment must agree with scope ──────────────────────────────────────────


def test_hos_cannot_assign_a_ticket_to_the_wrong_trade(
    api, nrb_hos, nrb_plumber, target
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
    api, nrb_hos, nrb_electrician, target
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


def test_assignable_technicians_list_is_narrowed_by_trade(
    api, nrb_hos, nrb_electrician, nrb_plumber, nrb_section, electrical
):
    api.force_authenticate(nrb_hos)
    response = api.get(
        reverse("section-assignable-technicians", args=[nrb_section.pk]),
        {"sub_section": electrical.pk},
    )
    assert response.status_code == 200
    ids = {row["id"] for row in response.json()}
    assert ids == {nrb_electrician.pk}


def test_claim_is_allowed_for_the_matching_trade(api, nrb_electrician, target):
    api.force_authenticate(nrb_electrician)
    response = api.post(reverse("ticket-claim", args=[target.pk]))
    assert response.status_code == 200
    target.refresh_from_db()
    assert target.assigned_to_id == nrb_electrician.pk


def test_technician_with_a_second_trade_reaches_both(
    api, nrb_section, electrical, plumbing, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """The positive case for multi-trade technicians — scope narrows, it does
    not simply deny."""
    tech = factories.make_technician("multi", nrb_section, [electrical, plumbing])
    api.force_authenticate(tech)
    for ticket in (nrb_electrical_ticket, nrb_plumbing_ticket):
        response = api.get(reverse("ticket-detail", args=[ticket.pk]))
        assert response.status_code == 200


# ── The Feedback tab ──────────────────────────────────────────────────────────
#
# Four roles mount it. A rating is only readable by people who could already
# read the ticket it belongs to, so the list filters through scoped_ticket_qs
# rather than defining a second rule that could drift from it.


@pytest.fixture
def rated_electrical(nrb_electrical_ticket):
    from apps.tickets.models import TicketFeedback

    nrb_electrical_ticket.status = "closed"
    nrb_electrical_ticket.save(update_fields=["status"])
    return TicketFeedback.objects.create(
        ticket=nrb_electrical_ticket, rating=5, comment="Quick work"
    )


@pytest.fixture
def rated_plumbing(nrb_plumbing_ticket):
    from apps.tickets.models import TicketFeedback

    return TicketFeedback.objects.create(ticket=nrb_plumbing_ticket, rating=2)


def _feedback(api, user):
    api.force_authenticate(user)
    response = api.get(reverse("ticket-feedback-list"))
    assert response.status_code == 200, response.json()
    return response.json()["results"]


def test_hos_sees_every_rating_in_the_section(
    api, nrb_hos, rated_electrical, rated_plumbing
):
    assert len(_feedback(api, nrb_hos)) == 2


def test_a_technician_sees_only_their_own_trade(
    api, nrb_electrician, rated_electrical, rated_plumbing
):
    """A trade's reputation is shared, so this is not "ratings on work I did" —
    but it stops at the trade boundary, exactly as the ticket list does."""
    rows = _feedback(api, nrb_electrician)
    assert [row["ticket_no"] for row in rows] == [rated_electrical.ticket.ticket_no]


def test_another_campus_is_not_visible(
    api, msa_hos, rated_electrical, msa_electrical_ticket
):
    from apps.tickets.models import TicketFeedback

    TicketFeedback.objects.create(ticket=msa_electrical_ticket, rating=3)
    rows = _feedback(api, msa_hos)
    assert [row["ticket_no"] for row in rows] == [msa_electrical_ticket.ticket_no]


def test_a_requester_sees_only_the_ratings_they_gave(
    api, requester, msa_requester, rated_electrical, msa_electrical_ticket
):
    from apps.tickets.models import TicketFeedback

    TicketFeedback.objects.create(ticket=msa_electrical_ticket, rating=1)
    assert len(_feedback(api, requester)) == 1
    assert len(_feedback(api, msa_requester)) == 1


def test_a_roleless_user_sees_nothing_not_everything(
    api, nrb, rated_electrical, rated_plumbing, db
):
    roleless = factories.make_user("no_role_feedback", campus=nrb)
    assert _feedback(api, roleless) == []


def test_the_row_carries_what_the_tab_renders(api, nrb_hos, rated_electrical):
    [row] = _feedback(api, nrb_hos)
    assert row["rating"] == 5
    assert row["comment"] == "Quick work"
    assert row["ticket_no"] == rated_electrical.ticket.ticket_no
    assert set(row) >= {"service_item", "section", "assigned_to", "resolved_at"}


def test_ratings_can_be_filtered_to_the_bad_ones(
    api, nrb_hos, rated_electrical, rated_plumbing
):
    api.force_authenticate(nrb_hos)
    response = api.get(reverse("ticket-feedback-list"), {"rating": 2})
    assert [r["rating"] for r in response.json()["results"]] == [2]


def test_feedback_requires_authentication(api):
    assert api.get(reverse("ticket-feedback-list")).status_code == 401
