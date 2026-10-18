"""Accounts that need fixing, and deactivation in place of delete."""

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts import health
from apps.accounts.models import CustomUser, RoleAssignment, TechnicianTrade
from apps.accounts.scope import post_holder
from apps.tickets.models import Ticket
from tests import factories

pytestmark = pytest.mark.django_db

LOGIN = "/api/v1/auth/login/"
ME = "/api/v1/auth/me/"
USERS = reverse("user-list")


def _deactivate(api, actor, user):
    api.force_authenticate(actor)
    return api.post(reverse("user-deactivate", args=[user.pk]))


def _row(api, admin_user, user):
    api.force_authenticate(admin_user)
    return next(r for r in api.get(USERS).json()["results"] if r["id"] == user.pk)


# ─── What needs fixing ──────────────────────────────────────────────────────


def test_an_account_with_no_home_campus_needs_fixing(api, admin_user, manager):
    row = _row(api, admin_user, manager)

    assert [p["code"] for p in row["problems"]] == ["no_home_campus"]
    assert row["problems"][0]["effect"] == "A ticket they raise has no campus to route to."


def test_a_technician_holding_no_trade_needs_fixing(api, admin_user, nrb, nrb_electrician):
    TechnicianTrade.objects.filter(user=nrb_electrician).delete()

    assert [p["code"] for p in _row(api, admin_user, nrb_electrician)["problems"]] == ["technician_without_trade"]


def test_a_working_account_has_no_problems(api, admin_user, nrb_electrician, requester):
    assert _row(api, admin_user, nrb_electrician)["problems"] == []
    assert _row(api, admin_user, requester)["problems"] == []


def test_accounts_to_fix_leaves_out_the_deactivated(manager, admin_user):
    assert {u.pk for u, _ in health.accounts_to_fix()} == {manager.pk, admin_user.pk}

    CustomUser.objects.filter(pk=manager.pk).update(is_active=False)

    assert {u.pk for u, _ in health.accounts_to_fix()} == {admin_user.pk}


def test_the_user_list_reads_problems_without_a_query_per_user(api, admin_user, nrb, electrical, django_assert_max_num_queries):
    for n in range(8):
        factories.make_technician(f"tech{n}", nrb, [electrical])
    api.force_authenticate(admin_user)

    with django_assert_max_num_queries(8):
        api.get(USERS)


# ─── Deactivate, never delete ───────────────────────────────────────────────


def test_an_account_cannot_be_deleted(api, admin_user, requester):
    api.force_authenticate(admin_user)

    assert api.delete(reverse("user-detail", args=[requester.pk])).status_code == 405
    assert CustomUser.objects.filter(pk=requester.pk).exists()


@pytest.mark.parametrize("who", ["manager", "nrb_hos", "nrb_hod", "nrb_electrician", "requester"])
def test_only_the_admin_deactivates(api, request, requester, who):
    response = _deactivate(api, request.getfixturevalue(who), requester)

    assert response.status_code == 403
    requester.refresh_from_db()
    assert requester.is_active


def test_the_admin_cannot_deactivate_themselves(api, admin_user):
    assert _deactivate(api, admin_user, admin_user).status_code == 400
    admin_user.refresh_from_db()
    assert admin_user.is_active


def test_a_deactivated_person_cannot_sign_in_or_use_a_token_they_hold(api, admin_user, requester):
    from rest_framework_simplejwt.tokens import AccessToken

    token = str(AccessToken.for_user(requester))
    response = _deactivate(api, admin_user, requester)

    assert response.status_code == 200 and response.json()["is_active"] is False
    api.force_authenticate(None)
    assert api.post(LOGIN, {"email": requester.email, "password": "pw"}, format="json").status_code != 200
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert api.get(ME).status_code == 401


def test_deactivation_keeps_their_tickets_and_history(api, admin_user, requester, nrb, electrical, priorities):
    ticket = factories.make_ticket(requester, nrb, electrical)

    _deactivate(api, admin_user, requester)

    ticket.refresh_from_db()
    assert ticket.raised_by_id == requester.pk


def test_a_deactivated_post_holder_leaves_the_post_vacant(api, admin_user, nrb, nrb_hos):
    assert post_holder("hos", campus=nrb) == nrb_hos

    _deactivate(api, admin_user, nrb_hos)

    assert post_holder("hos", campus=nrb) is None
    assert RoleAssignment.objects.filter(user=nrb_hos, role="hos").exists()


def test_escalation_skips_a_deactivated_hos_to_the_hod(
    api, admin_user, nrb_hos, nrb_hod, nrb_electrical_ticket
):
    factories.age_past(nrb_electrical_ticket, "escalate_to_hos_minutes")
    _deactivate(api, admin_user, nrb_hos)

    assert factories.escalate(nrb_electrical_ticket, timezone.now()) is True
    assert nrb_electrical_ticket.current_level == "hod"


def test_a_deactivated_technician_drops_off_the_assignment_list(api, admin_user, nrb_hos, nrb, electrical, nrb_electrician):
    _deactivate(api, admin_user, nrb_electrician)
    api.force_authenticate(nrb_hos)

    rows = api.get("/api/v1/technicians/", {"campus": nrb.pk, "trade": electrical.pk}).json()

    assert nrb_electrician.pk not in {r["id"] for r in rows}


def test_reactivating_restores_sign_in_and_the_post(api, admin_user, nrb, nrb_hos):
    _deactivate(api, admin_user, nrb_hos)
    api.force_authenticate(admin_user)

    response = api.post(reverse("user-reactivate", args=[nrb_hos.pk]))

    assert response.status_code == 200 and response.json()["is_active"] is True
    assert post_holder("hos", campus=nrb) == nrb_hos
    api.force_authenticate(None)
    assert api.post(LOGIN, {"email": nrb_hos.email, "password": "pw"}, format="json").status_code == 200


# ─── Everywhere a deactivated person stops counting ─────────────────────────


def test_a_deactivated_person_cannot_refresh_a_session(api, requester):
    response = api.post(LOGIN, {"email": requester.email, "password": "pw"}, format="json")
    assert response.status_code == 200
    # Deactivated behind the client's back, so its refresh cookie is still in the jar.
    CustomUser.objects.filter(pk=requester.pk).update(is_active=False)

    response = api.post("/api/v1/auth/refresh/")

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired refresh token."


def test_a_deactivated_technician_cannot_be_assigned(api, admin_user, nrb_hos, nrb_electrician, nrb_electrical_ticket):
    _deactivate(api, admin_user, nrb_electrician)
    api.force_authenticate(nrb_hos)

    response = api.post(
        reverse("ticket-assign", args=[nrb_electrical_ticket.pk]), {"assigned_to": nrb_electrician.pk}, format="json"
    )

    assert response.status_code == 400
    nrb_electrical_ticket.refresh_from_db()
    assert nrb_electrical_ticket.assigned_to_id is None


def test_a_deactivated_technician_leaves_the_staffing_figures(api, admin_user, nrb, electrical, nrb_electrician):
    from apps.analytics import metrics

    assert (metrics.technicians_by_campus([nrb.pk]), metrics.staffed_pairs([nrb.pk])) == (
        {nrb.pk: 1}, {(nrb.pk, electrical.pk)})

    _deactivate(api, admin_user, nrb_electrician)

    assert (metrics.technicians_by_campus([nrb.pk]), metrics.staffed_pairs([nrb.pk])) == ({}, set())
    api.force_authenticate(admin_user)
    roster = next(r for r in api.get(reverse("campus-roster")).json()["results"] if r["id"] == nrb.pk)
    assert roster["technician_count"] == 0


def test_a_deactivated_hos_leaves_the_campus_roster_vacant(api, admin_user, nrb, nrb_hos):
    _deactivate(api, admin_user, nrb_hos)
    api.force_authenticate(admin_user)

    roster = next(r for r in api.get(reverse("campus-roster")).json()["results"] if r["id"] == nrb.pk)

    assert roster["hos"] is None


def test_a_deactivated_hos_is_not_told_of_new_work(api, admin_user, requester, nrb, electrical, nrb_hos, nrb_hod, priorities):
    from apps.notifications.models import Notification

    _deactivate(api, admin_user, nrb_hos)
    factories.make_ticket(requester, nrb, electrical)
    from apps.notifications.notify import emit_ticket_created

    emit_ticket_created(Ticket.objects.latest("pk"))

    assert not Notification.objects.filter(user=nrb_hos, event_type="ticket_created").exists()
    assert Notification.objects.filter(user=nrb_hod, event_type="ticket_created").exists()


def test_the_technician_roster_names_every_campus_a_technician_works(api, nrb_hos, nrb, msa, electrical, plumbing, admin_user):
    both = factories.make_technician("both", nrb, [electrical])
    factories.link_technician(both, msa, plumbing)
    api.force_authenticate(admin_user)

    row = next(r for r in api.get("/api/v1/technicians/").json() if r["id"] == both.pk)

    assert row["campus_ids"] == sorted([nrb.pk, msa.pk])


@pytest.mark.parametrize("role", ["hos", "hod"])
def test_a_deactivated_account_cannot_take_a_held_post(api, admin_user, request, nrb, requester, role):
    holder = request.getfixturevalue(f"nrb_{role}")
    CustomUser.objects.filter(pk=requester.pk).update(is_active=False)
    api.force_authenticate(admin_user)

    response = api.post(
        reverse("user-role-assignments", args=[requester.pk]), {"role": role, "campus_id": nrb.pk}, format="json"
    )

    assert response.status_code == 400 and "deactivated" in response.json()["role"]
    assert post_holder(role, campus=nrb) == holder


def test_a_deactivated_account_can_still_be_edited_in_the_post_it_holds(api, admin_user, nrb, nrb_hos):
    _deactivate(api, admin_user, nrb_hos)
    api.force_authenticate(admin_user)

    response = api.post(
        reverse("user-role-assignments", args=[nrb_hos.pk]), {"role": "hos", "campus_id": nrb.pk}, format="json"
    )

    assert response.status_code == 201
    assert RoleAssignment.objects.get(user=nrb_hos).role == "hos"
