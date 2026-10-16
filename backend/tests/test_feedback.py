"""The Feedback page's two reads: the period's ratings, a page at a time, and
its figures over every rating in the period."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.analytics import metrics
from apps.tickets.models import Ticket

from . import factories

pytestmark = pytest.mark.django_db

LIST = "ticket-feedback-list"
SUMMARY = "ticket-feedback-summary"


def _rated(requester, campus, trade, stars, comment="", days_ago=0, assigned_to=None):
    """A ticket rated `days_ago` days ago."""
    ticket = factories.make_ticket(requester, campus, trade, assigned_to=assigned_to)
    factories.rate_ticket(ticket, stars, comment)
    Ticket.objects.filter(pk=ticket.pk).update(rated_at=timezone.now() - timedelta(days=days_ago))
    return ticket


def test_the_figures_cover_every_rating_in_the_period_not_one_page(
    api, manager, requester, nrb, electrical, priorities
):
    for n in range(25):
        _rated(requester, nrb, electrical, 5 if n % 5 else 2, "Good" if n < 10 else "")
    api.force_authenticate(manager)

    page = api.get(reverse(LIST), {"days": 30}).json()
    summary = api.get(reverse(SUMMARY), {"days": 30}).json()

    assert (page["count"], len(page["results"]), page["next"] is not None) == (25, 20, True)
    assert summary["count"] == 25 and summary["commented"] == 10
    assert summary["stars"] == [
        {"stars": 5, "count": 20}, {"stars": 4, "count": 0}, {"stars": 3, "count": 0},
        {"stars": 2, "count": 5}, {"stars": 1, "count": 0},
    ]
    assert summary["average"] == pytest.approx((20 * 5 + 5 * 2) / 25, abs=0.01)


def test_the_period_is_when_the_rating_was_given(api, manager, requester, nrb, electrical, priorities):
    recent = _rated(requester, nrb, electrical, 4, days_ago=3)
    older = _rated(requester, nrb, electrical, 1, days_ago=40)
    factories.age_ticket(recent, days=60)  # raised long ago, rated this week
    api.force_authenticate(manager)

    month = {r["ticket_no"] for r in api.get(reverse(LIST), {"days": 30}).json()["results"]}
    quarter = {r["ticket_no"] for r in api.get(reverse(LIST), {"days": 90}).json()["results"]}

    assert month == {recent.ticket_no}
    assert quarter == {recent.ticket_no, older.ticket_no}
    assert api.get(reverse(SUMMARY), {"days": 30}).json()["count"] == 1


def test_a_star_narrows_the_list_and_leaves_the_figures_whole(
    api, manager, requester, nrb, electrical, priorities
):
    _rated(requester, nrb, electrical, 2, "Came back")
    _rated(requester, nrb, electrical, 5)
    api.force_authenticate(manager)

    rows = api.get(reverse(LIST), {"days": 30, "rating": 2}).json()["results"]
    summary = api.get(reverse(SUMMARY), {"days": 30, "rating": 2}).json()

    assert [r["rating"] for r in rows] == [2]
    assert summary["count"] == 2


@pytest.mark.parametrize("bad", ["0", "6", "two", "4.5", ""])
def test_a_star_outside_one_to_five_is_refused(api, manager, bad):
    api.force_authenticate(manager)
    assert api.get(reverse(LIST), {"rating": bad}).status_code == 400


def test_a_bad_period_falls_back_to_the_default_rather_than_failing(
    api, manager, requester, nrb, electrical, priorities
):
    _rated(requester, nrb, electrical, 3)
    api.force_authenticate(manager)

    for params in ({"days": "lots"}, {"date_from": "yesterday", "date_to": "2026-13-40"}):
        assert api.get(reverse(LIST), params).status_code == 200
        assert api.get(reverse(SUMMARY), params).json()["count"] == 1


def test_a_technicians_figures_are_their_own_jobs_only(
    api, nrb, electrical, nrb_electrician, requester, priorities
):
    colleague = factories.make_technician("elec_two", nrb, [electrical])
    _rated(requester, nrb, electrical, 5, assigned_to=nrb_electrician)
    _rated(requester, nrb, electrical, 1, assigned_to=colleague)
    api.force_authenticate(nrb_electrician)

    summary = api.get(reverse(SUMMARY), {"days": 30}).json()

    assert (summary["count"], summary["average"]) == (1, 5.0)


def test_a_requester_reads_no_figures(api, requester):
    api.force_authenticate(requester)
    assert api.get(reverse(SUMMARY)).status_code == 403


def test_the_figures_over_no_ratings_are_empty_not_zero(db):
    summary = metrics.ratings(Ticket.objects.none())
    assert (summary["count"], summary["average"], summary["commented"]) == (0, None, 0)
    assert [s["count"] for s in summary["stars"]] == [0, 0, 0, 0, 0]


def test_pages_over_a_fixed_window_are_disjoint_and_cover_it_all(
    api, manager, requester, nrb, electrical, priorities
):
    rated = [_rated(requester, nrb, electrical, 4, days_ago=n % 5) for n in range(45)]
    now = timezone.now()
    window = {"date_from": (now - timedelta(days=30)).isoformat(), "date_to": now.isoformat()}
    api.force_authenticate(manager)

    seen = []
    for page in (1, 2, 3):
        seen += [r["id"] for r in api.get(reverse(LIST), {**window, "page": page}).json()["results"]]
    # A rating given after the window was fixed stays out of every page.
    _rated(requester, nrb, electrical, 1)

    assert len(seen) == len(set(seen)) == 45
    assert set(seen) == {t.pk for t in rated}
    assert api.get(reverse(SUMMARY), window).json()["count"] == 45


def test_a_hos_reads_only_their_campuses_figures(
    api, nrb_hos, requester, msa_requester, nrb, msa, electrical, priorities
):
    _rated(requester, nrb, electrical, 5)
    _rated(msa_requester, msa, electrical, 1)
    api.force_authenticate(nrb_hos)

    summary = api.get(reverse(SUMMARY), {"days": 30}).json()

    assert (summary["count"], summary["average"]) == (1, 5.0)


def test_the_figures_need_a_signed_in_caller(api):
    assert api.get(reverse(SUMMARY)).status_code == 401


def test_the_figures_ignore_a_star_however_it_is_written(
    api, manager, requester, nrb, electrical, priorities
):
    _rated(requester, nrb, electrical, 3)
    _rated(requester, nrb, electrical, 5)
    api.force_authenticate(manager)

    for rating in ("abc", "2", "9"):
        response = api.get(reverse(SUMMARY), {"days": 30, "rating": rating})
        assert response.status_code == 200 and response.json()["count"] == 2
