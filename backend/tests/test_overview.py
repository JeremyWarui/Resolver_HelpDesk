"""The manager's overview: who may read it, and what each section says."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.analytics import overview
from apps.tickets.models import Ticket

from . import factories

pytestmark = pytest.mark.django_db

URL = "analytics:overview"


def _settle(ticket, late=False, days_ago=0):
    """Close a ticket raised `days_ago` days ago, on time or late."""
    raised = timezone.now() - timedelta(days=days_ago)
    due = raised + timedelta(hours=8)
    Ticket.objects.filter(pk=ticket.pk).update(
        status="closed",
        created_at=raised,
        clock_started_at=raised,
        resolution_due_at=due,
        resolved_at=due + timedelta(hours=2) if late else due - timedelta(hours=2),
    )
    return ticket


def _get(api, user, **params):
    api.force_authenticate(user)
    response = api.get(reverse(URL), params)
    assert response.status_code == 200, response.content[:300]
    return response.json()


@pytest.mark.parametrize("role", ["admin_user", "nrb_hod", "nrb_hos", "nrb_electrician", "requester"])
def test_only_the_manager_reads_the_overview(api, request, role):
    api.force_authenticate(request.getfixturevalue(role))
    assert api.get(reverse(URL)).status_code == 403


def test_the_overview_needs_a_signed_in_caller(api):
    assert api.get(reverse(URL)).status_code == 401


def test_the_headline_compares_with_the_period_before(
    api, manager, requester, nrb, electrical, priorities
):
    for late in (False, False, True):
        _settle(factories.make_ticket(requester, nrb, electrical), late=late, days_ago=5)
    _settle(factories.make_ticket(requester, nrb, electrical), late=True, days_ago=40)

    data = _get(api, manager, days=30)

    assert data["current"]["resolution_sla_pct"] == pytest.approx(66.7)
    assert data["previous"]["resolution_sla_pct"] == 0.0
    assert data["previous"]["total"] == 1


def test_a_campus_row_carries_live_work_and_staffing(
    api, manager, requester, nrb, electrical, priorities, nrb_electrician
):
    factories.make_technician("elec_two", nrb, [electrical])
    held = factories.make_ticket(requester, nrb, electrical, status="in_progress", assigned_to=nrb_electrician)
    Ticket.objects.filter(pk=held.pk).update(
        current_level="hod", resolution_due_at=timezone.now() - timedelta(hours=1)
    )
    factories.make_ticket(requester, nrb, electrical)  # open, nobody on it

    row = _get(api, manager, days=30)["campuses"][0]

    assert (row["label"], row["total"], row["open_now"]) == ("Nairobi", 2, 2)
    assert (row["overdue"], row["at_hod"], row["technicians"], row["jobs_each"]) == (1, 1, 2, 0.5)


def test_trades_by_campus_counts_each_pair_and_totals_each_trade(
    api, manager, requester, msa_requester, nrb, msa, electrical, plumbing, priorities
):
    factories.make_ticket(requester, nrb, electrical)
    factories.make_ticket(requester, nrb, plumbing)
    factories.make_ticket(msa_requester, msa, electrical)

    grid = _get(api, manager, days=30)["trade_by_campus"]

    assert grid["trades"] == ["Electrical", "Plumbing"]
    rows = {r["campus"]: r for r in grid["rows"]}
    assert rows["Nairobi"]["counts"] == {"Electrical": 1, "Plumbing": 1} and rows["Nairobi"]["total"] == 2
    assert rows["Mombasa"]["counts"] == {"Electrical": 1}
    assert grid["totals"] == {"Electrical": 2, "Plumbing": 1}


def test_a_building_whose_fault_keeps_coming_back_is_flagged_with_its_trade(
    api, manager, requester, nrb, plumbing, priorities
):
    pipe = factories.make_service_item(plumbing, "Burst pipe")
    hostel = factories.make_facility(nrb, "Wamalwa")
    for _ in range(overview.REPEAT_AT):
        factories.make_ticket(requester, nrb, plumbing, service_item=pipe, facility=hostel)
    factories.make_ticket(requester, nrb, plumbing)  # one elsewhere: no pattern

    rows = _get(api, manager, days=30)["facilities"]

    assert [r["label"] for r in rows] == ["Wamalwa"]
    assert rows[0]["flag"] == "act" and rows[0]["suggestion"] == "Plumbing overhaul"
    assert rows[0]["repeats"] == [{"label": "Burst pipe", "total": overview.REPEAT_AT}]


def test_a_fault_seen_fewer_times_than_the_repeat_mark_is_no_pattern(
    api, manager, requester, nrb, plumbing, priorities
):
    pipe = factories.make_service_item(plumbing, "Burst pipe")
    hostel = factories.make_facility(nrb, "Wamalwa")
    for _ in range(overview.REPEAT_AT - 1):
        factories.make_ticket(requester, nrb, plumbing, service_item=pipe, facility=hostel)

    assert _get(api, manager, days=30)["facilities"] == []


def test_the_insights_name_the_weakest_campus_and_a_trade_nobody_covers(
    api, manager, requester, msa_requester, nrb, msa, electrical, plumbing, priorities, nrb_electrician
):
    for late in (False, False):
        _settle(factories.make_ticket(requester, nrb, electrical), late=late, days_ago=3)
    for late in (True, True, False):
        _settle(factories.make_ticket(msa_requester, msa, electrical), late=late, days_ago=3)
    factories.make_ticket(requester, nrb, plumbing)  # live, and Nairobi has no plumber

    texts = [i["text"] for i in _get(api, manager, days=30)["insights"]]

    assert "Mombasa resolved 33.3% on time, the lowest of 2 campuses." in texts
    assert "Nairobi has no plumbing technician and 1 open plumbing job." in texts


def test_nothing_below_target_raises_no_insight(
    api, manager, requester, msa_requester, nrb, msa, electrical, priorities, nrb_electrician, msa_electrician
):
    for user, campus in ((requester, nrb), (msa_requester, msa)):
        _settle(factories.make_ticket(user, campus, electrical), days_ago=2)

    assert _get(api, manager, days=30)["insights"] == []


def test_a_campus_narrows_every_section(
    api, manager, requester, msa_requester, nrb, msa, electrical, priorities
):
    factories.make_ticket(requester, nrb, electrical)
    factories.make_ticket(msa_requester, msa, electrical)

    data = _get(api, manager, days=30, campus=nrb.pk)

    assert data["campus"] == {"id": nrb.pk, "name": "Nairobi"}
    assert [c["label"] for c in data["campuses"]] == ["Nairobi"]
    assert data["current"]["total"] == 1
    assert [r["campus"] for r in data["trade_by_campus"]["rows"]] == ["Nairobi"]


@pytest.mark.parametrize("bad", ["abc", "-1", "999999", "", "²", "１"])
def test_a_campus_that_is_not_one_is_refused(api, manager, bad):
    api.force_authenticate(manager)
    assert api.get(reverse(URL), {"campus": bad}).status_code == 400


def test_the_trend_and_holds_follow_the_campus_too(
    api, manager, requester, msa_requester, nrb, msa, electrical, priorities
):
    factories.make_ticket(requester, nrb, electrical)
    held = factories.make_ticket(msa_requester, msa, electrical, status="pending", pending_reason="material_not_in_store")
    Ticket.objects.filter(pk=held.pk).update(paused_at=timezone.now())

    data = _get(api, manager, days=30, campus=nrb.pk)

    assert sum(p["total"] for p in data["trend"]) == 1
    assert data["bottlenecks"] == []


def test_a_campus_with_only_live_work_still_has_a_row_and_counts(
    api, manager, requester, msa_requester, nrb, msa, electrical, priorities
):
    _settle(factories.make_ticket(requester, nrb, electrical), days_ago=2)
    old = factories.make_ticket(msa_requester, msa, electrical, status="in_progress")
    factories.age_ticket(old, days=60)
    Ticket.objects.filter(pk=old.pk).update(current_level="hod")

    data = _get(api, manager, days=30)
    mombasa = next(c for c in data["campuses"] if c["label"] == "Mombasa")

    assert (mombasa["total"], mombasa["open_now"], mombasa["at_hod"]) == (0, 1, 1)
    assert data["at_hod_now"] == sum(c["at_hod"] for c in data["campuses"])
    assert any("Mombasa has 1 job with the HOD" in i["text"] for i in data["insights"])


def test_a_ticket_on_the_seam_counts_in_one_period_only(manager, requester, nrb, electrical, priorities):
    from apps.analytics import metrics

    window = metrics.resolve_window({"days": 30})
    ticket = factories.make_ticket(requester, nrb, electrical)
    Ticket.objects.filter(pk=ticket.pk).update(created_at=window["from"])
    qs = Ticket.objects.all()

    assert metrics.totals(qs, window)["total"] == 1
    assert metrics.totals(qs, metrics.previous_window(window))["total"] == 0


def test_down_from_is_said_only_when_the_campus_fell(
    api, manager, requester, msa_requester, nrb, msa, electrical, priorities
):
    _settle(factories.make_ticket(requester, nrb, electrical), days_ago=2)
    _settle(factories.make_ticket(msa_requester, msa, electrical), late=True, days_ago=2)
    _settle(factories.make_ticket(msa_requester, msa, electrical), late=True, days_ago=40)

    text = next(i["text"] for i in _get(api, manager, days=30)["insights"] if i["kind"] == "campus")

    assert text == "Mombasa resolved 0% on time, the lowest of 2 campuses."


def test_one_trade_measured_is_never_the_lowest_trade(
    api, manager, requester, msa_requester, nrb, msa, electrical, priorities
):
    _settle(factories.make_ticket(requester, nrb, electrical), late=True, days_ago=2)

    texts = [i["text"] for i in _get(api, manager, days=30)["insights"]]

    assert not any("the lowest trade" in t for t in texts)


def test_a_building_with_many_faults_but_no_repeat_is_watched(
    api, manager, requester, nrb, electrical, priorities
):
    busy = factories.make_facility(nrb, "Busy Block")
    for n in range(8):
        item = factories.make_service_item(electrical, f"Fault {n}")
        factories.make_ticket(requester, nrb, electrical, service_item=item, facility=busy)
    for name in ("Quiet A", "Quiet B"):
        factories.make_ticket(requester, nrb, electrical, facility=factories.make_facility(nrb, name))

    rows = _get(api, manager, days=30)["facilities"]

    assert [(r["label"], r["flag"], r["suggestion"]) for r in rows] == [("Busy Block", "watch", "Many faults: inspect")]


def test_two_buildings_alone_never_make_a_many_faults_watch(
    api, manager, requester, nrb, electrical, priorities
):
    busy = factories.make_facility(nrb, "Busy Block")
    for n in range(10):
        item = factories.make_service_item(electrical, f"Fault {n}")
        factories.make_ticket(requester, nrb, electrical, service_item=item, facility=busy)
    factories.make_ticket(requester, nrb, electrical, facility=factories.make_facility(nrb, "Quiet A"))

    assert _get(api, manager, days=30)["facilities"] == []


def test_a_campus_narrows_live_figures_insights_and_staffing(
    api, manager, requester, msa_requester, nrb, msa, electrical, plumbing, priorities, msa_electrician
):
    factories.make_ticket(requester, nrb, plumbing)  # Nairobi: live, no plumber, unassigned
    factories.make_ticket(msa_requester, msa, electrical, assigned_to=msa_electrician, status="assigned")

    data = _get(api, manager, days=30, campus=msa.pk)

    assert (data["unassigned_now"], data["at_hod_now"]) == (0, 0)
    assert [c["technicians"] for c in data["campuses"]] == [1]
    assert not any("Nairobi" in i["text"] for i in data["insights"])


def test_a_technician_covering_two_campuses_counts_at_each(
    api, manager, requester, msa_requester, nrb, msa, electrical, priorities
):
    both = factories.make_technician("roving", nrb, [electrical])
    factories.link_technician(both, msa, electrical)
    factories.make_ticket(requester, nrb, electrical, assigned_to=both, status="assigned")
    factories.make_ticket(msa_requester, msa, electrical)

    rows = {c["label"]: c for c in _get(api, manager, days=30)["campuses"]}

    assert rows["Nairobi"]["technicians"] == rows["Mombasa"]["technicians"] == 1
    assert (rows["Nairobi"]["jobs_each"], rows["Mombasa"]["jobs_each"]) == (1.0, 0.0)


def test_the_headline_change_is_the_servers(api, manager, requester, nrb, electrical, priorities):
    _settle(factories.make_ticket(requester, nrb, electrical), days_ago=2)
    _settle(factories.make_ticket(requester, nrb, electrical), late=True, days_ago=40)

    change = _get(api, manager, days=30)["change"]

    assert change["resolution_sla_pts"] == 100.0
    assert change["rating"] is None
