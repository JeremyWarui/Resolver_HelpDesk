"""The manager's dashboard: who may read it, and what it says."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.analytics import dashboard, metrics, overview
from apps.tickets.models import Ticket

from . import factories

pytestmark = pytest.mark.django_db

URL = "analytics:dashboard"


def _get(api, user):
    api.force_authenticate(user)
    response = api.get(reverse(URL))
    assert response.status_code == 200, response.content[:300]
    return response.json()


def _raised(ticket, days_ago):
    when = timezone.now() - timedelta(days=days_ago)
    Ticket.objects.filter(pk=ticket.pk).update(created_at=when, clock_started_at=when)
    return ticket


@pytest.mark.parametrize("role", ["admin_user", "nrb_hod", "nrb_hos", "nrb_electrician", "requester"])
def test_only_the_manager_reads_the_dashboard(api, request, role):
    api.force_authenticate(request.getfixturevalue(role))
    assert api.get(reverse(URL)).status_code == 403


def test_the_dashboard_needs_a_signed_in_caller(api):
    assert api.get(reverse(URL)).status_code == 401


def test_live_work_splits_into_its_stages_and_adds_up(
    api, manager, requester, nrb, electrical, priorities, nrb_electrician
):
    factories.make_ticket(requester, nrb, electrical)  # waiting
    factories.make_ticket(requester, nrb, electrical, status="in_progress", assigned_to=nrb_electrician)
    held = factories.make_ticket(requester, nrb, electrical, status="pending", assigned_to=nrb_electrician)
    Ticket.objects.filter(pk=held.pk).update(current_level="hod")
    factories.make_ticket(requester, nrb, electrical, status="closed")  # not live

    data = _get(api, manager)
    live = data["live"]
    nairobi = next(c for c in data["campuses"] if c["label"] == "Nairobi")

    assert (live["open_now"], live["waiting"], live["with_technician"], live["on_hold"]) == (3, 1, 1, 1)
    assert live["at_hod"] == 1
    assert (nairobi["waiting"], nairobi["with_technician"], nairobi["on_hold"]) == (1, 1, 1)


def test_this_week_is_the_last_seven_kenyan_days_against_the_seven_before(
    api, manager, requester, nrb, electrical, priorities
):
    _raised(factories.make_ticket(requester, nrb, electrical), days_ago=2)
    _raised(factories.make_ticket(requester, nrb, electrical), days_ago=9)
    _raised(factories.make_ticket(requester, nrb, electrical), days_ago=20)

    data = _get(api, manager)

    assert (data["this_week"]["total"], data["last_week"]["total"]) == (1, 1)


def test_a_day_counts_what_was_resolved_in_it_whenever_it_was_raised(
    api, manager, requester, nrb, electrical, priorities
):
    old = _raised(factories.make_ticket(requester, nrb, electrical), days_ago=30)
    Ticket.objects.filter(pk=old.pk).update(status="resolved", resolved_at=timezone.now())

    days = _get(api, manager)["days"]

    assert len(days) == dashboard.DAYS
    today = timezone.now().astimezone(metrics.REPORT_TZ).date().isoformat()
    assert days[-1] == {"day": today, "raised": 0, "resolved": 1}
    assert sum(d["raised"] for d in days) == 0


def test_every_campus_has_a_bar_even_when_calm(api, manager, requester, nrb, msa, electrical, priorities):
    factories.make_ticket(requester, nrb, electrical)

    rows = {c["label"]: c for c in _get(api, manager)["campuses"]}

    assert list(rows) == ["Mombasa", "Nairobi"]
    assert (rows["Nairobi"]["open_now"], rows["Mombasa"]["open_now"]) == (1, 0)


def test_the_campus_bars_add_up_to_the_cards(
    api, manager, requester, msa_requester, nrb, msa, electrical, priorities, nrb_electrician
):
    factories.make_ticket(requester, nrb, electrical)
    factories.make_ticket(msa_requester, msa, electrical, status="in_progress", assigned_to=nrb_electrician)
    factories.make_ticket(msa_requester, msa, electrical, status="pending", assigned_to=nrb_electrician)

    data = _get(api, manager)

    for key in ("open_now", "waiting", "with_technician", "on_hold"):
        assert sum(c[key] for c in data["campuses"]) == data["live"][key], key


def test_the_campus_table_is_the_reports_table_over_the_week(
    api, manager, requester, nrb, electrical, priorities
):
    _raised(factories.make_ticket(requester, nrb, electrical), days_ago=2)
    _raised(factories.make_ticket(requester, nrb, electrical), days_ago=9)

    data = _get(api, manager)
    window = dashboard.week()

    assert data["campus_table"] == overview.campus_table(Ticket.objects.all(), window)
    assert [(r["label"], r["total"], r["open_now"]) for r in data["campus_table"]] == [("Nairobi", 1, 2)]
    assert data["target_pct"] == metrics.SLA_TARGET_PCT


def test_the_week_starts_at_kenyan_midnight_six_days_back():
    now = timezone.now()
    window = dashboard.week(now)
    start = window["from"].astimezone(metrics.REPORT_TZ)

    assert (start.hour, start.minute) == (0, 0)
    assert (now.astimezone(metrics.REPORT_TZ).date() - start.date()).days == dashboard.DAYS - 1
