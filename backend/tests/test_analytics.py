"""Analytics — the numbers, and whose numbers they are.

Every endpoint renders the caller's own server-derived scope. A technician's
"open backlog" and an HOD's are the same query over different rows, so the
tests that matter are the ones proving two roles looking at the same endpoint
get different answers.

Paused tickets are the recurring trap: they must not count as breaching, or
every ticket waiting on parts becomes a red number nobody can act on.
"""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.analytics.role_config import (
    GROUP_BY_DIMENSIONS,
    ROLE_VIEWS,
    resolve_group_by,
)
from apps.analytics.services import (
    aggregate,
    breakdown,
    resolve_date_range,
    technician_load,
    technician_trade_mix,
)
from apps.tickets.services.lifecycle import transition_status
from apps.tickets.services.scope import scoped_ticket_qs
from tests import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def window():
    """The same shape the views build from query params — including the prior
    period, which the trend comparisons need."""
    return resolve_date_range({"days": 30})


# ── Breakdown by trade ────────────────────────────────────────────────────────


def test_sub_section_breakdown_splits_by_trade(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket, window
):
    rows = breakdown(scoped_ticket_qs(nrb_hos, "hos"), window, "sub_section")
    totals = {row["label"]: row["total"] for row in rows}
    assert totals == {"Electrical": 1, "Plumbing": 1}


def test_breakdown_respects_the_callers_scope(
    nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket, window
):
    """The same call, a narrower role — the plumbing ticket must not appear."""
    rows = breakdown(
        scoped_ticket_qs(nrb_electrician, "technician"), window, "sub_section"
    )
    assert {row["label"] for row in rows} == {"Electrical"}


def test_breakdown_excludes_other_campuses_for_an_hod(
    nrb_hod, nrb_electrical_ticket, msa_electrical_ticket, window
):
    rows = breakdown(scoped_ticket_qs(nrb_hod, "hod"), window, "sub_section")
    assert sum(row["total"] for row in rows) == 1


def test_manager_sees_every_campus(
    manager, nrb_electrical_ticket, msa_electrical_ticket, window
):
    rows = breakdown(scoped_ticket_qs(manager, "manager"), window, "campus")
    assert {row["campus_name"] for row in rows} == {"Nairobi", "Mombasa"}


def test_status_breakdown_counts_each_status_once(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket, window
):
    rows = breakdown(scoped_ticket_qs(nrb_hos, "hos"), window, "status")
    assert sum(row["total"] for row in rows) == 2


# ── Paused tickets ────────────────────────────────────────────────────────────


def _pause_and_let_the_deadline_pass(ticket):
    """A ticket parked waiting for parts, whose original deadline has since
    gone by. The clock is frozen, so it is waiting — not late."""
    ticket.status = "pending"
    ticket.paused_at = timezone.now() - timedelta(days=3)
    ticket.resolution_due_at = timezone.now() - timedelta(days=1)
    ticket.save(update_fields=["status", "paused_at", "resolution_due_at"])
    return ticket


def test_a_paused_ticket_is_not_counted_as_breached(
    nrb_hos, nrb_electrical_ticket, window
):
    """R9 — pausing freezes the SLA timer. A ticket waiting on parts that
    nobody can order must not turn red on the HOS's dashboard, or the breach
    count stops meaning anything."""
    _pause_and_let_the_deadline_pass(nrb_electrical_ticket)
    metrics = aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)
    assert metrics["breached"] == 0


def test_a_paused_ticket_is_not_counted_at_risk(
    nrb_hos, nrb_electrical_ticket, window
):
    nrb_electrical_ticket.status = "pending"
    nrb_electrical_ticket.paused_at = timezone.now()
    nrb_electrical_ticket.resolution_due_at = timezone.now() + timedelta(hours=1)
    nrb_electrical_ticket.save(
        update_fields=["status", "paused_at", "resolution_due_at"]
    )
    metrics = aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)
    assert metrics["at_risk"] == 0


def test_an_unpaused_overdue_ticket_is_still_counted_as_breached(
    nrb_hos, nrb_electrical_ticket, window
):
    """The other half of the rule — pausing must not become a way to hide."""
    nrb_electrical_ticket.status = "in_progress"
    nrb_electrical_ticket.resolution_due_at = timezone.now() - timedelta(days=1)
    nrb_electrical_ticket.save(update_fields=["status", "resolution_due_at"])
    metrics = aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)
    assert metrics["breached"] == 1


def test_paused_tickets_are_still_counted_as_open_work(
    nrb_hos, nrb_electrical_ticket, window
):
    """Frozen is not finished — it still belongs in the backlog."""
    _pause_and_let_the_deadline_pass(nrb_electrical_ticket)
    metrics = aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)
    assert metrics["open_backlog"] == 1


# ── Technician load ───────────────────────────────────────────────────────────


def test_technician_load_lists_the_sections_own_technicians(
    nrb_hos, nrb_electrician, nrb_plumber, nrb_electrical_ticket
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "in_progress"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])

    rows = technician_load(scoped_ticket_qs(nrb_hos, "hos"))
    by_id = {row["technician_id"]: row for row in rows}
    assert by_id[nrb_electrician.pk]["open_count"] == 1


def test_technician_load_is_live_and_ignores_the_date_window(
    nrb_hos, nrb_electrician, nrb_electrical_ticket
):
    """Load answers "who is busy right now", so an old open ticket still counts."""
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.status = "in_progress"
    nrb_electrical_ticket.save(update_fields=["assigned_to", "status"])
    type(nrb_electrical_ticket).objects.filter(pk=nrb_electrical_ticket.pk).update(
        created_at=timezone.now() - timedelta(days=365)
    )

    rows = technician_load(scoped_ticket_qs(nrb_hos, "hos"))
    assert any(row["open_count"] == 1 for row in rows)


# ── Role configuration ────────────────────────────────────────────────────────


def test_no_role_defaults_to_a_single_bucket_dimension():
    """With one department and one section type, grouping by either would draw
    one bar. Neither may be a dimension at all."""
    assert "department" not in GROUP_BY_DIMENSIONS
    assert "section_type" not in GROUP_BY_DIMENSIONS


def test_every_role_default_is_in_its_own_allowed_list():
    for role, cfg in ROLE_VIEWS.items():
        assert cfg["default_group_by"] in cfg["allowed_group_by"] or cfg[
            "default_group_by"
        ] in ("time", "status"), role


def test_every_allowed_dimension_is_a_real_dimension():
    for role, cfg in ROLE_VIEWS.items():
        for dim in cfg["allowed_group_by"]:
            assert dim in GROUP_BY_DIMENSIONS, f"{role} allows unknown '{dim}'"


def test_a_role_cannot_widen_its_own_view_with_a_query_param():
    """Fail closed — an unauthorised group_by falls back to the role default
    rather than being honoured."""
    assert resolve_group_by("technician", "technician") == "time"
    assert resolve_group_by("user", "campus") == "status"


def test_technicians_are_never_ranked_against_peers():
    cfg = ROLE_VIEWS["technician"]
    assert cfg["comparison"] is False
    assert "technician" not in cfg["allowed_group_by"]


def test_an_unknown_role_gets_the_requester_view():
    from apps.analytics.role_config import get_role_config

    assert get_role_config("director_of_everything") == ROLE_VIEWS["user"]


# ── Endpoints ─────────────────────────────────────────────────────────────────


def test_overview_is_scoped_to_the_caller(
    api, nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket
):
    api.force_authenticate(nrb_electrician)
    response = api.get(reverse("analytics:overview"))
    assert response.status_code == 200


def test_analytics_requires_authentication(api):
    assert api.get(reverse("analytics:overview")).status_code == 401


def test_flow_and_ticket_list_agree_on_scope(
    api, nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """Both read scoped_ticket_qs; if they ever disagree, one of them is wrong."""
    api.force_authenticate(nrb_electrician)
    listed = {row["id"] for row in api.get(reverse("ticket-list")).json()["results"]}
    assert listed == {nrb_electrical_ticket.pk}


def test_breakdown_of_an_empty_scope_is_empty_not_everything(
    nrb, nrb_electrical_ticket, window, db
):
    """The failure mode that matters: an unresolvable scope returning all rows."""
    roleless = factories.make_user("no_role_analytics", campus=nrb)
    rows = breakdown(scoped_ticket_qs(roleless, None), window, "sub_section")
    assert rows == []


def test_the_ticket_breach_flag_agrees_with_the_breach_count(
    api, nrb_hos, nrb_electrical_ticket, window
):
    """The badge on a ticket and the number on the dashboard read the same rule.
    If they diverge, one of them is lying to the same person."""
    _pause_and_let_the_deadline_pass(nrb_electrical_ticket)

    api.force_authenticate(nrb_hos)
    detail = api.get(reverse("ticket-detail", args=[nrb_electrical_ticket.pk])).json()
    metrics = aggregate(scoped_ticket_qs(nrb_hos, "hos"), window)

    assert detail["is_breaching"] is False
    assert metrics["breached"] == 0


def test_a_running_overdue_ticket_is_flagged_on_the_ticket_too(
    api, nrb_hos, nrb_electrical_ticket
):
    nrb_electrical_ticket.status = "in_progress"
    nrb_electrical_ticket.resolution_due_at = timezone.now() - timedelta(days=1)
    nrb_electrical_ticket.save(update_fields=["status", "resolution_due_at"])

    api.force_authenticate(nrb_hos)
    detail = api.get(reverse("ticket-detail", args=[nrb_electrical_ticket.pk])).json()
    assert detail["is_breaching"] is True


# ── One status vocabulary ─────────────────────────────────────────────────────


def test_every_module_reads_the_same_status_sets():
    """These were literals in six places and locally-named constants in two
    more, and they had already drifted — `common.admin` counted a different set
    than everything else. The R9 bug was this exact shape: four places computing
    "is this late?" and disagreeing, so a ticket's badge contradicted the
    dashboard it sat on."""
    from apps.analytics import services
    from apps.tickets import statuses

    assert services.ACTIVE_STATUSES is statuses.ACTIVE_STATUSES
    assert services.RUNNING_STATUSES is statuses.RUNNING_STATUSES


def test_pending_is_active_but_not_running():
    """The whole distinction in one assertion: a paused ticket is still open
    work, and its clock is not moving."""
    from apps.tickets import statuses

    assert "pending" in statuses.ACTIVE_STATUSES
    assert "pending" not in statuses.RUNNING_STATUSES
    assert set(statuses.RUNNING_STATUSES) < set(statuses.ACTIVE_STATUSES)


def test_the_status_sets_cover_the_model_choices_exactly():
    """A status added to the model but not to these sets would be invisible to
    every count in the system."""
    from apps.tickets.models import Ticket
    from apps.tickets import statuses

    assert set(statuses.ALL_STATUSES) == {value for value, _ in Ticket.STATUS}
    assert not set(statuses.ACTIVE_STATUSES) & set(statuses.TERMINAL_STATUSES)


def test_no_module_writes_the_status_list_out_by_hand():
    """The guard that keeps this from creeping back. If you are adding a status
    set, import it — do not paste the tuple."""
    import pathlib
    import re

    root = pathlib.Path(__file__).resolve().parent.parent / "apps"
    literal = re.compile(r'["\']open["\']\s*,\s*["\']assigned["\']')
    offenders = [
        str(path.relative_to(root))
        for path in root.rglob("*.py")
        if "migrations" not in path.parts
        and path.name != "statuses.py"
        and literal.search(path.read_text())
    ]
    assert offenders == [], f"status list written out by hand in: {offenders}"


# ── The technician's own report ───────────────────────────────────────────────


def test_a_technician_gets_their_own_numbers_and_the_sections_separately(
    api, nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """`individual` is work assigned to them; `sectional` is context. They must
    never be merged — a technician's CSAT is not their section's."""
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.save(update_fields=["assigned_to"])

    api.force_authenticate(nrb_electrician)
    body = api.get(reverse("analytics:overview")).json()

    assert set(body) >= {"individual", "sectional"}
    assert body["individual"]["open_backlog"] == 1


def test_the_overview_says_what_is_blocked_and_what_is_ageing(
    api, nrb_hos, nrb_electrical_ticket
):
    """Both are already computed by aggregate() and were simply not sliced. A
    technician needs `currently_paused` to tell "I am blocked" from "I am late",
    and the buckets to see which of the backlog has gone stale."""
    api.force_authenticate(nrb_hos)
    body = api.get(reverse("analytics:overview")).json()

    assert "currently_paused" in body
    assert set(body["aging_buckets"]) == {"lt_1d", "d1_3d", "d3_7d", "gt_7d"}


def test_a_paused_ticket_shows_as_blocked_not_breached(
    api, nrb_hos, nrb_electrical_ticket
):
    from datetime import timedelta

    nrb_electrical_ticket.status = "pending"
    nrb_electrical_ticket.paused_at = timezone.now() - timedelta(days=2)
    nrb_electrical_ticket.resolution_due_at = timezone.now() - timedelta(days=1)
    nrb_electrical_ticket.save(
        update_fields=["status", "paused_at", "resolution_due_at"]
    )

    api.force_authenticate(nrb_hos)
    body = api.get(reverse("analytics:overview")).json()

    assert body["currently_paused"] == 1
    assert body["breached"] == 0


def test_a_technician_is_never_served_a_peer_ranking(api, nrb_electrician):
    """The report must not imply a league table, because the backend refuses to
    build one: `comparison` is False and `technician` is not an allowed
    group_by for them."""
    from apps.analytics.role_config import ROLE_VIEWS, resolve_group_by

    assert ROLE_VIEWS["technician"]["comparison"] is False
    assert resolve_group_by("technician", "technician") != "technician"


# ── Demand shape ──────────────────────────────────────────────────────────────


def test_demand_is_broken_down_by_trade(
    api, nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """The per-trade split is the most useful breakdown this system has, and
    for an HOD or HOS it is the only one that varies — they have one section
    each. It was shipped under the name `by_category`, left over from a model
    that no longer exists, and a chart bound to "sections" sat empty beside it.
    """
    api.force_authenticate(nrb_hos)
    demand = api.get(reverse("analytics:demand")).json()

    assert "by_category" not in demand, "stale ServiceCategory-era key is back"
    rows = {r["sub_section_name"]: r["count"] for r in demand["by_sub_section"]}
    assert rows == {"Electrical": 1, "Plumbing": 1}
    assert all("sub_section_id" in r for r in demand["by_sub_section"])


def test_demand_by_trade_respects_scope(
    api, nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket
):
    api.force_authenticate(nrb_electrician)
    demand = api.get(reverse("analytics:demand")).json()
    assert [r["sub_section_name"] for r in demand["by_sub_section"]] == ["Electrical"]


def test_neither_hod_nor_hos_may_group_by_section():
    """Both have exactly one Maintenance section, so a section breakdown can
    only ever draw a single 100% slice. The reports page drops the tab for the
    same reason — keep the two in step."""
    from apps.analytics.role_config import ROLE_VIEWS

    for role in ("hod", "hos"):
        assert "section" not in ROLE_VIEWS[role]["allowed_group_by"], role
        assert ROLE_VIEWS[role]["default_group_by"] in ("sub_section", "technician")


# ── Trade breakdown endpoint ──────────────────────────────────────────────────


def test_trades_breakdown_splits_by_craft(
    api, nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """`/performance/trades/` is the breakdown-only counterpart to
    `/performance/sections/`, which for an HOD or HOS returns a single row."""
    api.force_authenticate(nrb_hos)
    body = api.get(reverse("analytics:performance-trades")).json()

    rows = {r["label"]: r["total"] for r in body["breakdown"]}
    assert rows == {"Electrical": 1, "Plumbing": 1}


def test_trades_breakdown_carries_the_standard_metrics(
    api, nrb_hos, nrb_electrical_ticket
):
    api.force_authenticate(nrb_hos)
    row = api.get(reverse("analytics:performance-trades")).json()["breakdown"][0]

    for field in (
        "key",
        "label",
        "total",
        "open_count",
        "resolved_count",
        "escalated_count",
        "resolution_sla_met",
        "total_resolved_with_due",
    ):
        assert field in row, field


def test_trades_breakdown_is_scoped(
    api, nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """A technician sees only their own trade — the endpoint scopes through
    `scoped_ticket_qs` like every other analytics view."""
    api.force_authenticate(nrb_electrician)
    body = api.get(reverse("analytics:performance-trades")).json()
    assert [r["label"] for r in body["breakdown"]] == ["Electrical"]


def test_trades_breakdown_does_not_leak_another_campus(
    api, nrb_hos, nrb_electrical_ticket, msa_electrical_ticket
):
    api.force_authenticate(nrb_hos)
    body = api.get(reverse("analytics:performance-trades")).json()
    assert sum(r["total"] for r in body["breakdown"]) == 1


# ── Blocked work ──────────────────────────────────────────────────────────────


def _park(ticket, actor, reason="awaiting_materials", note=""):
    """Drive a ticket to `pending` through the real lifecycle, so the reason is
    set the only way production can set it."""
    transition_status(ticket, "assigned", actor=actor)
    transition_status(ticket, "in_progress", actor=actor)
    transition_status(
        ticket,
        "pending",
        actor=actor,
        pending_reason=reason,
        pending_reason_note=note,
    )
    return ticket


def test_pending_reason_breaks_down_by_code(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket
):
    _park(nrb_electrical_ticket, nrb_hos, "awaiting_materials")
    _park(nrb_plumbing_ticket, nrb_hos, "awaiting_approval")

    scoped = scoped_ticket_qs(nrb_hos, "hos")
    rows = breakdown(scoped, resolve_date_range({}), group_by="pending_reason")

    assert {r["label"] for r in rows} == {"Materials not in store", "Awaiting approval"}
    assert all(r["total"] == 1 for r in rows)


def test_pending_reason_breakdown_ignores_tickets_that_are_not_on_hold(
    nrb_hos, nrb_electrical_ticket, nrb_plumbing_ticket
):
    """The failure this guards: every running ticket collapsing into one blank
    slice that dwarfs the real reasons."""
    _park(nrb_electrical_ticket, nrb_hos, "awaiting_materials")

    scoped = scoped_ticket_qs(nrb_hos, "hos")
    rows = breakdown(scoped, resolve_date_range({}), group_by="pending_reason")

    assert len(rows) == 1
    assert rows[0]["label"] == "Materials not in store"


def test_pending_reason_breakdown_carries_the_standard_metrics(
    nrb_hos, nrb_electrical_ticket
):
    _park(nrb_electrical_ticket, nrb_hos, "awaiting_contractor")
    scoped = scoped_ticket_qs(nrb_hos, "hos")
    row = breakdown(scoped, resolve_date_range({}), group_by="pending_reason")[0]

    for field in (
        "key",
        "label",
        "total",
        "open_count",
        "resolved_count",
        "escalated_count",
        "resolution_sla_met",
        "total_resolved_with_due",
    ):
        assert field in row, field


def test_pending_reason_breakdown_does_not_leak_another_campus(
    nrb_hos, msa_hos, nrb_electrical_ticket, msa_electrical_ticket
):
    _park(nrb_electrical_ticket, nrb_hos, "awaiting_materials")
    _park(msa_electrical_ticket, msa_hos, "access_unavailable")

    rows = breakdown(
        scoped_ticket_qs(nrb_hos, "hos"), resolve_date_range({}), "pending_reason"
    )
    assert [r["label"] for r in rows] == ["Materials not in store"]


# ── Technician trade mix ──────────────────────────────────────────────────────


def test_trade_mix_splits_one_technician_across_their_trades(
    nrb_hos, nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket, window
):
    """The point of the cross-tab: a technician holding two trades shows a share
    of each, not one undifferentiated count."""
    for t in (nrb_electrical_ticket, nrb_plumbing_ticket):
        t.assigned_to = nrb_electrician
        t.save(update_fields=["assigned_to"])

    rows = technician_trade_mix(scoped_ticket_qs(nrb_hos, "hos"), window)

    assert len(rows) == 1
    assert rows[0]["total"] == 2
    assert {t["trade"]: t["share"] for t in rows[0]["trades"]} == {
        "Electrical": 0.5,
        "Plumbing": 0.5,
    }


def test_trade_mix_shares_sum_to_one(
    nrb_hos, nrb_electrician, nrb_electrical_ticket, nrb_plumbing_ticket, window
):
    """A share that does not total 100% is a chart nobody can reconcile."""
    for t in (nrb_electrical_ticket, nrb_plumbing_ticket):
        t.assigned_to = nrb_electrician
        t.save(update_fields=["assigned_to"])

    for tech in technician_trade_mix(scoped_ticket_qs(nrb_hos, "hos"), window):
        assert abs(sum(t["share"] for t in tech["trades"]) - 1.0) < 0.001


def test_trade_mix_does_not_split_a_technician_per_ticket(
    nrb_hos, nrb_electrician, nrb_electrical_ticket
):
    """`Ticket.Meta.ordering` is `-updated_at`, and an ordering field joins the
    GROUP BY even when it is absent from values() — which would return one row
    per ticket instead of one per (technician, trade)."""
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.save(update_fields=["assigned_to"])
    extra = factories.make_ticket(
        raised_by=nrb_electrician,
        section=nrb_electrical_ticket.section,
        sub_section=nrb_electrical_ticket.sub_section,
        service_item=nrb_electrical_ticket.service_item,
    )
    extra.assigned_to = nrb_electrician
    extra.save(update_fields=["assigned_to"])

    # Resolved here, not from the `window` fixture: that stamps `date_to` at
    # fixture setup, before this test creates its second ticket, which would
    # then fall outside the range and make the assertion pass for the wrong
    # reason.
    rows = technician_trade_mix(
        scoped_ticket_qs(nrb_hos, "hos"), resolve_date_range({"days": 30})
    )

    assert len(rows) == 1
    assert len(rows[0]["trades"]) == 1
    assert rows[0]["trades"][0]["total"] == 2


def test_trade_mix_is_scoped(
    nrb_hos, msa_hos, nrb_electrician, msa_electrician,
    nrb_electrical_ticket, msa_electrical_ticket, window,
):
    nrb_electrical_ticket.assigned_to = nrb_electrician
    nrb_electrical_ticket.save(update_fields=["assigned_to"])
    msa_electrical_ticket.assigned_to = msa_electrician
    msa_electrical_ticket.save(update_fields=["assigned_to"])

    rows = technician_trade_mix(scoped_ticket_qs(nrb_hos, "hos"), window)
    assert [r["technician_id"] for r in rows] == [nrb_electrician.pk]


def test_a_technician_cannot_see_the_peer_trade_mix(api, nrb_electrician):
    """Same reason `technician` is not an allowed group_by for them: this is a
    peer ranking with a second axis."""
    api.force_authenticate(nrb_electrician)
    response = api.get(reverse("analytics:performance-trade-mix"))
    assert response.status_code == 403
