"""The admin's dashboard: what needs setting up, and whether the work is moving."""

from datetime import timedelta

import pytest
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from apps.accounts.identity import display_name
from apps.accounts.models import CustomUser
from apps.system_feedback.models import SystemFeedback
from apps.tickets import escalation
from apps.tickets.models import Ticket, TicketLog
from tests import factories

pytestmark = pytest.mark.django_db

URL = "analytics:desk"


def _get(api, admin_user):
    api.force_authenticate(admin_user)
    response = api.get(reverse(URL))
    assert response.status_code == 200, response.content[:300]
    return response.json()


@pytest.mark.parametrize("who", ["manager", "nrb_hod", "nrb_hos", "nrb_electrician", "requester"])
def test_only_the_admin_reads_the_desk(api, request, who):
    api.force_authenticate(request.getfixturevalue(who))
    assert api.get(reverse(URL)).status_code == 403


def test_the_desk_needs_a_login(api):
    assert api.get(reverse(URL)).status_code == 401


def test_the_escalation_card_says_the_schedule_state_and_what_is_due(api, admin_user, nrb_hos, nrb_electrical_ticket):
    factories.age_ticket(nrb_electrical_ticket, minutes=nrb_electrical_ticket.priority.escalate_to_hos_minutes + 1)

    before = _get(api, admin_user)["escalation"]
    assert (before["state"], before["last_finished_at"], before["due_hos"], before["due_hod"]) == ("never", None, 1, 0)

    escalation.record_run(scheduled=True)
    after = _get(api, admin_user)["escalation"]
    assert (after["state"], after["due_hos"]) == ("running", 0)
    assert after["last_finished_at"] is not None


def test_the_cover_card_is_the_cover_grid(api, admin_user, nrb, msa, electrical, nrb_electrician, msa_requester, priorities):
    factories.make_ticket(msa_requester, msa, electrical)

    data = _get(api, admin_user)
    api.force_authenticate(admin_user)
    grid = api.get(reverse("analytics:cover")).json()

    assert data["cover"] == {"gaps": grid["gaps"], "gap_campuses": grid["gap_campuses"], "stuck": grid["stuck"]}
    assert data["cover"] == {"gaps": 1, "gap_campuses": 1, "stuck": 1}


def test_the_accounts_card_counts_each_problem(api, admin_user, manager, nrb_electrician):
    from apps.accounts.models import TechnicianTrade

    TechnicianTrade.objects.filter(user=nrb_electrician).delete()

    card = _get(api, admin_user)["accounts_to_fix"]

    assert card == {"count": 3, "by_problem": {"no_home_campus": 2, "technician_without_trade": 1}}


def test_email_reads_as_not_set_up_until_a_host_is_configured(api, admin_user):
    with override_settings(EMAIL_HOST=""):
        assert _get(api, admin_user)["email_configured"] is False
    with override_settings(EMAIL_HOST="smtp.ksg.ac.ke"):
        assert _get(api, admin_user)["email_configured"] is True


def test_waiting_too_long_counts_open_work_unassigned_for_a_day_by_its_clock(
    api, admin_user, requester, nrb, electrical, priorities, nrb_electrician
):
    old = factories.make_ticket(requester, nrb, electrical)
    Ticket.objects.filter(pk=old.pk).update(clock_started_at=timezone.now() - timedelta(hours=25))
    under = factories.make_ticket(requester, nrb, electrical)
    Ticket.objects.filter(pk=under.pk).update(clock_started_at=timezone.now() - timedelta(hours=23))
    young = factories.make_ticket(requester, nrb, electrical)
    held = factories.make_ticket(requester, nrb, electrical, status="assigned", assigned_to=nrb_electrician)
    Ticket.objects.filter(pk=held.pk).update(clock_started_at=timezone.now() - timedelta(hours=30))
    reopened = factories.make_ticket(requester, nrb, electrical)
    Ticket.objects.filter(pk=reopened.pk).update(created_at=timezone.now() - timedelta(days=9))
    # Raised a minute ago, so only its clock says it has waited.
    Ticket.objects.filter(pk=young.pk).update(clock_started_at=timezone.now() - timedelta(hours=30))

    assert _get(api, admin_user)["waiting_too_long"] == 2


def test_a_technician_who_touched_no_ticket_this_week_is_quiet(
    api, admin_user, requester, nrb, electrical, plumbing, priorities, nrb_electrician
):
    quiet = factories.make_technician("quiet_one", nrb, [plumbing])
    gone = factories.make_technician("gone", nrb, [electrical])
    CustomUser.objects.filter(pk=gone.pk).update(is_active=False)
    ticket = factories.make_ticket(requester, nrb, electrical)
    TicketLog.objects.create(ticket=ticket, actor=nrb_electrician, event_type="status_changed")
    stale = TicketLog.objects.create(ticket=ticket, actor=quiet, event_type="status_changed")
    TicketLog.objects.filter(pk=stale.pk).update(created_at=timezone.now() - timedelta(days=8))

    card = _get(api, admin_user)["technicians"]

    assert (card["total"], card["active"]) == (2, 1)
    assert [(q["id"], q["where"]) for q in card["quiet"]] == [(quiet.pk, "Nairobi Plumbing")]


def test_the_feedback_card_counts_unread_by_category_and_shows_the_latest_four(api, admin_user, requester):
    for n, category in enumerate(["problem", "idea", "idea", "praise", "problem"]):
        SystemFeedback.objects.create(author=requester, author_role="user", category=category, message=f"m{n}")
    SystemFeedback.objects.create(author=requester, author_role="user", category="problem", message="read", reviewed=True)

    card = _get(api, admin_user)["feedback"]

    assert card["unread"] == 5
    assert card["by_category"]["problem"] == 2 and card["by_category"]["idea"] == 2
    assert [f["message"] for f in card["latest"]] == ["m4", "m3", "m2", "m1"]


def test_each_campus_row_names_its_posts_and_its_gaps(
    api, admin_user, nrb, msa, electrical, plumbing, nrb_hos, nrb_hod, nrb_electrician, requester, priorities
):
    factories.make_facility(nrb, "Wamalwa")
    factories.make_ticket(requester, nrb, plumbing)
    CustomUser.objects.filter(pk=nrb_hod.pk).update(is_active=False)

    rows = {r["name"]: r for r in _get(api, admin_user)["campuses"]}

    nairobi = rows["Nairobi"]
    assert (nairobi["hos"], nairobi["hod"]) == (display_name(nrb_hos), None)
    assert (nairobi["technicians"], nairobi["gaps"], nairobi["stuck"]) == (1, ["Plumbing"], 1)
    assert nairobi["facilities"] >= 1
    assert (rows["Mombasa"]["hos"], rows["Mombasa"]["gaps"]) == (None, ["Electrical", "Plumbing"])
