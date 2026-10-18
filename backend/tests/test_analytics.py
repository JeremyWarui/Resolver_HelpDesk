"""Reporting — the figures, and whose figures they are.

Every figure is computed over the caller's own server-derived scope, so the
tests that matter prove two roles get different answers out of one endpoint.
The rest of the file is the set of rules the engine is not allowed to break:
settled means resolved *and* closed, a hold freezes the clock, a finished
ticket keeps its verdict, and a duration crosses the wire as a number.
"""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.analytics.metrics import bottlenecks, group, totals, trend
from apps.analytics.role_config import resolve_group_by
from apps.facilities.models import Facility
from apps.tickets.lifecycle import claim_ticket, transition_status
from apps.tickets.models import Ticket
from apps.tickets.scope import scoped_ticket_qs
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def window():
    """A 30-day window that stays open for the length of the test.

    `to` sits slightly ahead of now because a test creates and settles its
    tickets *after* this fixture runs, whereas in production the window closes
    at request time with everything it counts already in place.
    """
    now = timezone.now()
    return {"from": now - timedelta(days=30), "to": now + timedelta(minutes=5)}


def _figures(user, role, window):
    return totals(scoped_ticket_qs(user, role), window)


def _rows(user, role, window, *dimensions):
    return group(scoped_ticket_qs(user, role), window, dimensions)


def _resolve(ticket, technician):
    """Carry a ticket from open to resolved the way a technician does."""
    claim_ticket(ticket, technician)
    transition_status(ticket, "resolved", technician)
    return ticket


# ─── Scope: the figures belong to the caller ────────────────────────────────


def test_an_hods_numbers_exclude_another_campus(
    nrb_hod, nrb_electrical_ticket, msa_electrical_ticket, window
):
    figures = _figures(nrb_hod, "hod", window)
    assert figures["total"] == 1
    assert figures["open_backlog"] == 1


def test_a_technician_is_measured_on_their_pairs_not_the_cross_product(
    nrb, msa, electrical, plumbing, requester, msa_requester, priorities, window
):
    """Carpentry@Nairobi + Plumbing@Mombasa must not also match the two pairs
    nobody assigned. The single-campus case hides this, so both campuses are
    here on purpose."""
    tech = factories.make_technician("roving", nrb, [electrical])
    factories.link_technician(tech, msa, plumbing)

    factories.make_ticket(requester, nrb, electrical)  # held
    factories.make_ticket(msa_requester, msa, plumbing)  # held
    factories.make_ticket(requester, nrb, plumbing)  # cross product, not held
    factories.make_ticket(msa_requester, msa, electrical)  # cross product, not held

    assert _figures(tech, "technician", window)["total"] == 2


def test_a_breakdown_of_an_empty_scope_is_empty_not_everything(
    msa_hos, nrb_electrical_ticket, nrb_plumbing_ticket, window
):
    """Fail-closed: a scope with nothing in it returns nothing, never the lot."""
    assert _rows(msa_hos, "hos", window, "trade") == []


def test_the_endpoint_requires_authentication(api):
    assert api.get(reverse("analytics:analytics")).status_code == 401


@pytest.mark.parametrize(
    "params",
    [
        {"days": "abc"},
        {"days": "-5"},
        {"date_from": "not-a-date", "date_to": "also-not"},
        # Backwards: a window that ends before it starts is not a window.
        {"date_from": "2030-01-01", "date_to": "2020-01-01"},
        {"group_by": "trade,trade"},
        {"group_by": "nonsense"},
        {"bucket": "fortnight"},
    ],
)
def test_a_bad_query_param_falls_back_rather_than_breaking(
    api, nrb_hos, nrb_electrical_ticket, params
):
    """These arrive straight off the query string. A client should not be able
    to 500 the page by typing a date wrong."""
    api.force_authenticate(nrb_hos)
    response = api.get(reverse("analytics:analytics"), params)

    assert response.status_code == 200
    assert response.json()["totals"]["open_backlog"] == 1


@pytest.mark.parametrize(
    "role,requested,expected",
    [
        # A technician is never ranked against a peer, however they ask.
        ("technician", "technician", ["status"]),
        # A requester has nothing to be compared against.
        ("user", "campus", ["status"]),
        # Fail closed: an unknown role gets the requester's view.
        ("director_of_everything", "campus", ["status"]),
        # An allowed dimension is honoured, and so is an allowed pair.
        ("hos", "trade", ["trade"]),
        ("hos", "facility,trade", ["facility", "trade"]),
        # One bad half poisons the pair rather than being quietly dropped.
        ("hos", "facility,campus", ["technician"]),
    ],
)
def test_a_role_cannot_widen_its_own_view_with_a_query_param(role, requested, expected):
    """The dimensions a role may be compared on are the server's decision. A
    stale or hostile client asking for one it is not served gets the role's
    default, never the dimension."""
    assert resolve_group_by(role, requested) == expected


# ─── Volume and status ──────────────────────────────────────────────────────


def test_the_reported_volume_agrees_with_the_ticket_list(
    api, nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket, msa_electrical_ticket
):
    api.force_authenticate(nrb_hos)
    listed = api.get(reverse("ticket-list")).data["count"]
    reported = api.get(reverse("analytics:analytics")).data["totals"]["open_backlog"]
    assert listed == reported == 2


def test_the_status_split_counts_each_ticket_once(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket, window
):
    rows = _rows(nrb_hos, "hos", window, "status")
    assert sum(row["total"] for row in rows) == 2


def test_a_bucket_is_one_row_however_the_tickets_in_it_differ(
    nrb_hos, nrb, electrical, requester, nrb_electrician, priorities, window
):
    """Two tickets, one trade, claimed at different moments. Two things could
    split that single row into two: the `-updated_at` the scoped queryset
    carries, and the first-assignment timestamp annotated for response time.
    Both join the GROUP BY unless the query clears them."""
    early = factories.age_ticket(
        factories.make_ticket(requester, nrb, electrical), hours=5
    )
    late = factories.age_ticket(
        factories.make_ticket(requester, nrb, electrical), hours=1
    )
    claim_ticket(early, nrb_electrician)
    claim_ticket(late, nrb_electrician)

    rows = _rows(nrb_hos, "hos", window, "trade")
    assert [(r["label"], r["total"]) for r in rows] == [("Electrical", 2)]
    # And the average is over both of them, not one row each.
    assert 10000 <= rows[0]["response_seconds_avg"] <= 11000


# ─── Trade and facility ─────────────────────────────────────────────────────


def test_trade_breakdown_splits_by_craft(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket, window
):
    rows = _rows(nrb_hos, "hos", window, "trade")
    assert {r["label"]: r["total"] for r in rows} == {"Electrical": 1, "Plumbing": 1}


def test_trade_breakdown_does_not_leak_another_campus(
    nrb_hos, nrb_electrical_ticket, msa_electrical_ticket, window
):
    assert sum(r["total"] for r in _rows(nrb_hos, "hos", window, "trade")) == 1


def test_facility_health_is_one_row_per_facility_and_trade(
    nrb_hos, nrb, electrical, plumbing, requester, facility_types, priorities, window
):
    """Facility health is tickets by facility *and* trade: which building keeps
    breaking, and which craft it keeps breaking for."""
    lab = Facility.objects.create(
        campus=nrb, facility_type=facility_types["office_block"], name="Science Lab"
    )
    hall = Facility.objects.create(
        campus=nrb, facility_type=facility_types["office_block"], name="Great Hall"
    )
    for _ in range(3):
        factories.make_ticket(requester, nrb, electrical, facility=lab)
    factories.make_ticket(requester, nrb, plumbing, facility=lab)
    factories.make_ticket(requester, nrb, electrical, facility=hall)

    rows = _rows(nrb_hos, "hos", window, "facility", "trade")
    assert {(r["label"], r["label_2"]): r["total"] for r in rows} == {
        ("Science Lab", "Electrical"): 3,
        ("Science Lab", "Plumbing"): 1,
        ("Great Hall", "Electrical"): 1,
    }


# ─── Response and resolution time ───────────────────────────────────────────


def test_response_time_runs_from_raising_to_the_first_assignment(
    nrb_hos, nrb_electrical_ticket, nrb_electrician, window
):
    """Response is creation to the moment a technician takes it, whether they
    claimed it or an HOS handed it over. Both write the same log row."""
    ticket = factories.age_ticket(nrb_electrical_ticket, hours=3)
    claim_ticket(ticket, nrb_electrician)

    figures = _figures(nrb_hos, "hos", window)
    assert 10750 <= figures["response_seconds_avg"] <= 10900
    assert figures["response_sla_pct"] == 100.0


def test_a_response_after_its_target_counts_against_the_rate(
    nrb_hos, nrb_electrical_ticket, nrb_electrician, window
):
    nrb_electrical_ticket.response_due_at = timezone.now() - timedelta(hours=1)
    nrb_electrical_ticket.save(update_fields=["response_due_at"])
    claim_ticket(nrb_electrical_ticket, nrb_electrician)

    assert _figures(nrb_hos, "hos", window)["response_sla_pct"] == 0.0


def test_a_ticket_nobody_has_touched_has_no_response_time(
    nrb_hos, nrb_electrical_ticket, window
):
    figures = _figures(nrb_hos, "hos", window)
    assert figures["response_seconds_avg"] is None
    assert figures["response_sla_pct"] is None


def test_time_spent_on_hold_comes_out_of_the_resolution_time(
    nrb_hos, nrb_electrical_ticket, nrb_electrician, window
):
    """A job that waited two hours on a part nobody could supply did not take
    two hours of anybody's work."""
    ticket = factories.age_ticket(nrb_electrical_ticket, hours=3)
    claim_ticket(ticket, nrb_electrician)
    transition_status(
        ticket, "pending", nrb_electrician, pending_reason="material_not_in_store"
    )
    ticket.paused_at = timezone.now() - timedelta(hours=2)
    ticket.save(update_fields=["paused_at"])
    transition_status(ticket, "in_progress", nrb_electrician)
    transition_status(ticket, "resolved", nrb_electrician)

    # Three hours old, two of them on hold.
    assert 3500 <= _figures(nrb_hos, "hos", window)["resolution_seconds_avg"] <= 3700


def test_a_reopened_ticket_is_timed_on_its_latest_attempt(
    nrb_hos, nrb_electrical_ticket, nrb_electrician, requester, window
):
    """Raised two days ago, resolved, reopened, and fixed again within the
    hour: the figure is that hour, not the two days, as its SLA outcome is."""
    from apps.tickets.models import Ticket

    ticket = factories.age_ticket(nrb_electrical_ticket, days=2)
    claim_ticket(ticket, nrb_electrician)
    transition_status(ticket, "resolved", nrb_electrician)
    transition_status(ticket, "open", requester)

    Ticket.objects.filter(pk=ticket.pk).update(
        clock_started_at=timezone.now() - timedelta(hours=1)
    )
    ticket.refresh_from_db()
    claim_ticket(ticket, nrb_electrician)
    transition_status(ticket, "resolved", nrb_electrician)

    assert 3500 <= _figures(nrb_hos, "hos", window)["resolution_seconds_avg"] <= 3700


def test_a_closed_ticket_still_counts_as_settled(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket, nrb_electrician, nrb_plumber,
    window,
):
    """Closed is the normal end state. Measuring only `resolved` drops every
    ticket that was seen through to the end."""
    _resolve(nrb_electrical_ticket, nrb_electrician)
    transition_status(_resolve(nrb_plumbing_ticket, nrb_plumber), "closed", nrb_hos)

    assert _figures(nrb_hos, "hos", window)["settled"] == 2


# ─── Overdue, missed and escalated ──────────────────────────────────────────


def test_a_paused_ticket_is_never_counted_as_overdue(
    nrb_hos, nrb_electrical_ticket, nrb_electrician, window
):
    """`pending` freezes the clock, so a ticket waiting on parts is blocked, not
    late. Counting it would make the number un-actionable."""
    ticket = nrb_electrical_ticket
    claim_ticket(ticket, nrb_electrician)
    transition_status(
        ticket, "pending", nrb_electrician, pending_reason="material_not_in_store"
    )
    ticket.resolution_due_at = timezone.now() - timedelta(hours=2)
    ticket.save(update_fields=["resolution_due_at"])

    assert _figures(nrb_hos, "hos", window)["overdue"] == 0


def test_a_running_ticket_past_its_target_is_overdue(
    nrb_hos, nrb_electrical_ticket, window
):
    nrb_electrical_ticket.resolution_due_at = timezone.now() - timedelta(hours=2)
    nrb_electrical_ticket.save(update_fields=["resolution_due_at"])

    assert _figures(nrb_hos, "hos", window)["overdue"] == 1


def test_a_settled_ticket_is_judged_against_resolved_at_not_the_clock(
    nrb_hos, nrb_electrical_ticket, nrb_electrician, window
):
    """A finished ticket keeps its verdict. Comparing its due date to "now"
    would mark every ticket ever closed as late once that date passed. Overdue
    and missed are different words for different things."""
    ticket = _resolve(nrb_electrical_ticket, nrb_electrician)
    ticket.resolution_due_at = timezone.now() - timedelta(hours=2)
    ticket.save(update_fields=["resolution_due_at"])

    figures = _figures(nrb_hos, "hos", window)
    assert figures["overdue"] == 0
    assert figures["missed"] == 1
    assert figures["resolution_sla_pct"] == 0.0


def test_the_ticket_badge_agrees_with_the_overdue_count(
    api, nrb_hos, nrb_electrical_ticket, window
):
    """One ticket, two readers: the list's `is_breaching` flag and the reported
    count must never disagree about what late means."""
    nrb_electrical_ticket.resolution_due_at = timezone.now() - timedelta(hours=2)
    nrb_electrical_ticket.save(update_fields=["resolution_due_at"])

    api.force_authenticate(nrb_hos)
    row = api.get(reverse("ticket-list")).data["results"][0]

    assert row["is_breaching"] is True
    assert _figures(nrb_hos, "hos", window)["overdue"] == 1


def test_escalated_tickets_are_counted(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket, window
):
    nrb_electrical_ticket.current_level = "hos"
    nrb_electrical_ticket.save(update_fields=["current_level"])

    assert _figures(nrb_hos, "hos", window)["escalated"] == 1


# ─── Technician performance and ratings ─────────────────────────────────────


def test_technician_rows_carry_workload_and_rating(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket, nrb_electrician, window
):
    factories.rate_ticket(_resolve(nrb_electrical_ticket, nrb_electrician), 4)

    rows = _rows(nrb_hos, "hos", window, "technician")
    # The unassigned plumbing ticket is a triage gap, not a technician's row.
    assert len(rows) == 1
    assert rows[0]["label"] == "nrb_electrician"
    assert rows[0]["settled"] == 1
    assert rows[0]["rating_avg"] == 4.0
    assert rows[0]["rating_count"] == 1


def test_a_technician_is_named_the_way_the_rest_of_the_system_names_them(
    nrb_hos, nrb, electrical, requester, priorities, window
):
    """Every other surface names a technician through `display_name`, so a
    breakdown labelled by username calls one person two things on one screen.
    The fixtures carry no first or last name, which is why this test sets
    them."""
    tech = factories.make_technician("jane.mwangi", nrb, [electrical])
    tech.first_name, tech.last_name = "Jane", "Mwangi"
    tech.save(update_fields=["first_name", "last_name"])
    _resolve(factories.make_ticket(requester, nrb, electrical), tech)

    (row,) = _rows(nrb_hos, "hos", window, "technician")
    assert row["label"] == "Jane Mwangi"


def test_ratings_are_scoped_like_the_tickets_they_belong_to(
    nrb_hos, msa_hos, nrb_electrical_ticket, msa_electrical_ticket,
    nrb_electrician, msa_electrician, window,
):
    factories.rate_ticket(_resolve(nrb_electrical_ticket, nrb_electrician), 5)
    factories.rate_ticket(_resolve(msa_electrical_ticket, msa_electrician), 3)

    assert _figures(nrb_hos, "hos", window)["rating_avg"] == 5.0
    assert _figures(msa_hos, "hos", window)["rating_avg"] == 3.0


# ─── Bottlenecks: what is on hold ───────────────────────────────────────────


def test_bottlenecks_report_what_is_on_hold_right_now(
    nrb_hos, nrb_electrical_ticket, nrb_electrician, window
):
    """One row per reason, with the oldest hold in it: a count on its own does
    not say whether this is routine or a supplier that has stopped answering."""
    ticket = nrb_electrical_ticket
    claim_ticket(ticket, nrb_electrician)
    transition_status(
        ticket, "pending", nrb_electrician, pending_reason="material_not_in_store"
    )

    rows = bottlenecks(scoped_ticket_qs(nrb_hos, "hos"))
    assert len(rows) == 1
    assert rows[0]["key"] == "material_not_in_store"
    assert rows[0]["label"] == "Material not in store"
    assert rows[0]["total"] == 1
    ticket.refresh_from_db()
    assert rows[0]["since"] == ticket.paused_at


def test_a_hold_reason_says_which_trades_its_tickets_are_in(
    nrb_hos, nrb, electrical, plumbing, requester, nrb_electrician, priorities
):
    plumber = factories.make_technician("plumber", nrb, [plumbing])
    for trade, technician, count in ((plumbing, plumber, 2), (electrical, nrb_electrician, 1)):
        for _ in range(count):
            ticket = factories.make_ticket(requester, nrb, trade)
            claim_ticket(ticket, technician)
            transition_status(ticket, "pending", technician, pending_reason="material_not_in_store")

    [row] = bottlenecks(scoped_ticket_qs(nrb_hos, "hos"))

    assert row["total"] == 3
    assert [(t["label"], t["code"], t["total"]) for t in row["trades"]] == [
        (plumbing.name, plumbing.code, 2),
        (electrical.name, electrical.code, 1),
    ]


def test_a_ticket_back_at_work_is_no_longer_a_bottleneck(
    nrb_hos, nrb_electrical_ticket, nrb_electrician, window
):
    """The snapshot is the whole contract. `pending_reason` is cleared when work
    resumes, so a lifted hold leaves no trace here — the generated report is
    what keeps the record of a period, not the database."""
    ticket = nrb_electrical_ticket
    claim_ticket(ticket, nrb_electrician)
    transition_status(
        ticket, "pending", nrb_electrician, pending_reason="material_not_in_store"
    )
    assert bottlenecks(scoped_ticket_qs(nrb_hos, "hos")) != []

    transition_status(ticket, "in_progress", nrb_electrician)
    assert bottlenecks(scoped_ticket_qs(nrb_hos, "hos")) == []


def test_two_reasons_are_two_rows_biggest_first(
    nrb_hos, nrb, electrical, requester, nrb_electrician, priorities
):
    """And `since` is the oldest hold in each group, not the newest: the row is
    there to say how long this has been going on."""
    held = {}
    for reason, count in (("material_not_in_store", 2), ("location_inaccessible", 1)):
        for _ in range(count):
            ticket = factories.make_ticket(requester, nrb, electrical)
            claim_ticket(ticket, nrb_electrician)
            transition_status(ticket, "pending", nrb_electrician, pending_reason=reason)
            ticket.refresh_from_db()
            held.setdefault(reason, []).append(ticket.paused_at)

    rows = bottlenecks(scoped_ticket_qs(nrb_hos, "hos"))
    assert [(r["key"], r["total"]) for r in rows] == [
        ("material_not_in_store", 2),
        ("location_inaccessible", 1),
    ]
    assert rows[0]["since"] == min(held["material_not_in_store"])
    assert rows[0]["since"] < max(held["material_not_in_store"])


# ─── Trend ──────────────────────────────────────────────────────────────────


def test_the_trend_buckets_volume_over_the_window(
    nrb_hos, nrb, electrical, requester, priorities, window
):
    factories.make_ticket(requester, nrb, electrical)
    factories.age_ticket(factories.make_ticket(requester, nrb, electrical), days=3)

    rows = trend(scoped_ticket_qs(nrb_hos, "hos"), window, "day")
    assert sum(r["total"] for r in rows) == 2
    assert len(rows) == 2
    assert rows[0]["bucket"] < rows[1]["bucket"]


def test_an_unknown_bucket_falls_back_rather_than_raising(
    nrb_hos, nrb_electrical_ticket, window
):
    rows = trend(scoped_ticket_qs(nrb_hos, "hos"), window, "fortnight")
    assert sum(r["total"] for r in rows) == 1


# ─── The wire ───────────────────────────────────────────────────────────────


def test_durations_cross_the_wire_as_numbers(
    api, nrb_hos, nrb_electrical_ticket, nrb_electrician
):
    """A timedelta is not JSON. Every duration is reported in seconds so a
    client divides once and every client divides the same way."""
    claim_ticket(factories.age_ticket(nrb_electrical_ticket, hours=2), nrb_electrician)
    transition_status(nrb_electrical_ticket, "resolved", nrb_electrician)

    api.force_authenticate(nrb_hos)
    figures = api.get(reverse("analytics:analytics")).json()["totals"]

    for key in ("response_seconds_avg", "resolution_seconds_avg"):
        assert isinstance(figures[key], (int, float)), f"{key} is {figures[key]!r}"


def test_the_envelope_carries_every_reported_section(
    api, nrb_hos, nrb_electrical_ticket
):
    api.force_authenticate(nrb_hos)
    body = api.get(reverse("analytics:analytics")).json()

    assert set(body) == {
        "scope",
        "range",
        "totals",
        "breakdown",
        "bottlenecks",
        "trend",
    }
    assert body["scope"]["group_by"] == ["technician"]
    assert body["range"]["bucket"] == "day"
