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


def _get(api, user, **params):
    api.force_authenticate(user)
    response = api.get(reverse(URL), params)
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

    trend = _get(api, manager)["trend"]

    assert (trend["bucket"], len(trend["rows"])) == ("day", dashboard.DAYS)
    today = timezone.now().astimezone(metrics.REPORT_TZ).date().isoformat()
    assert trend["rows"][-1] == {"start": today, "raised": 0, "resolved": 1}
    assert sum(r["raised"] for r in trend["rows"]) == 0


def test_a_quarter_trend_is_cut_into_weeks_that_count_every_day(
    api, manager, requester, nrb, electrical, priorities
):
    for days_ago in (0, 6, 40, 89, 95):
        _raised(factories.make_ticket(requester, nrb, electrical), days_ago=days_ago)

    trend = _get(api, manager, trend_days=90)["trend"]

    assert (trend["bucket"], len(trend["rows"])) == ("week", 13)
    assert sum(r["raised"] for r in trend["rows"]) == 4


@pytest.mark.parametrize("bad", ["14", "abc", "-7", ""])
def test_a_period_that_is_not_offered_falls_back_to_the_week_and_all_open_work(
    api, manager, requester, nrb, electrical, priorities, bad
):
    _raised(factories.make_ticket(requester, nrb, electrical), days_ago=20)

    data = _get(api, manager, trend_days=bad, open_days=bad)

    assert (data["trend"]["bucket"], len(data["trend"]["rows"])) == ("day", dashboard.DAYS)
    assert next(c for c in data["campuses"] if c["label"] == "Nairobi")["open_now"] == 1


def test_the_cards_and_campus_table_stay_on_the_week_whatever_the_charts_read(
    api, manager, requester, nrb, electrical, priorities
):
    factories.make_ticket(requester, nrb, electrical)
    _raised(factories.make_ticket(requester, nrb, electrical), days_ago=40)

    week = _get(api, manager)
    quarter = _get(api, manager, trend_days=90, open_days=90)

    for key in ("this_week", "last_week", "campus_table", "facilities"):
        assert quarter[key] == week[key], key
    assert quarter["this_week"]["total"] == 1


def test_open_work_narrows_to_what_was_raised_in_its_period_and_the_cards_do_not(
    api, manager, requester, nrb, electrical, priorities
):
    factories.make_ticket(requester, nrb, electrical)
    _raised(factories.make_ticket(requester, nrb, electrical), days_ago=20)

    every = _get(api, manager)
    recent = _get(api, manager, open_days=7)
    nairobi = lambda data: next(c for c in data["campuses"] if c["label"] == "Nairobi")

    assert (nairobi(every)["open_now"], nairobi(recent)["open_now"]) == (2, 1)
    assert recent["live"]["open_now"] == 2


def test_the_facility_rows_are_the_reports_rows_over_the_week(
    api, manager, requester, nrb, electrical, priorities
):
    block = factories.make_facility(nrb, "Wamalwa")
    socket = factories.make_service_item(electrical)
    for _ in range(overview.REPEAT_AT):
        factories.make_ticket(requester, nrb, electrical, service_item=socket, facility=block)

    data = _get(api, manager)

    reports = overview.facilities(Ticket.objects.all(), dashboard.week())[:dashboard.FACILITY_ROWS]
    assert sorted(f["key"] for f in data["facilities"]) == sorted(f["key"] for f in reports)
    assert [(f["label"], f["total"], f["flag"]) for f in data["facilities"]] == [("Wamalwa", 3, "act")]


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


def test_the_dashboard_lists_the_buildings_most_faults_first(
    api, manager, requester, nrb, electrical, priorities
):
    hostel, library = factories.make_facility(nrb, "Hostel"), factories.make_facility(nrb, "Library")
    socket = factories.make_service_item(electrical)
    for _ in range(overview.REPEAT_AT):  # one fault over and over: act on it
        factories.make_ticket(requester, nrb, electrical, service_item=socket, facility=hostel)
    for n in range(6):  # many different faults: worth watching
        item = factories.make_service_item(electrical, f"Fault {n}")
        factories.make_ticket(requester, nrb, electrical, service_item=item, facility=library)
    factories.make_ticket(requester, nrb, electrical)

    rows = _get(api, manager)["facilities"]

    assert [(f["label"], f["flag"]) for f in rows] == [("Library", "watch"), ("Hostel", "act")]


def test_the_dashboard_keeps_the_reports_first_rows_before_it_sorts_them(
    api, manager, requester, nrb, electrical, priorities
):
    socket = factories.make_service_item(electrical)
    for name in ("Block A", "Block B", "Block C", "Block D", "Block E"):
        place = factories.make_facility(nrb, name)
        for _ in range(overview.REPEAT_AT):  # a repeated fault: act on it
            factories.make_ticket(requester, nrb, electrical, service_item=socket, facility=place)
    busy = factories.make_facility(nrb, "Busy Hall")
    for n in range(8):  # many different faults: worth watching, and the busiest
        item = factories.make_service_item(electrical, f"Fault {n}")
        factories.make_ticket(requester, nrb, electrical, service_item=item, facility=busy)

    labels = [f["label"] for f in _get(api, manager)["facilities"]]

    assert labels == ["Block A", "Block B", "Block C", "Block D", "Block E"]


def test_the_week_starts_at_kenyan_midnight_six_days_back():
    now = timezone.now()
    window = dashboard.week(now)
    start = window["from"].astimezone(metrics.REPORT_TZ)

    assert (start.hour, start.minute) == (0, 0)
    assert (now.astimezone(metrics.REPORT_TZ).date() - start.date()).days == dashboard.DAYS - 1
