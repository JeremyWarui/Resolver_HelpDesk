"""Login, refresh, and the single role each user carries.

Role cover, role switching and multiple simultaneous roles are all gone. The
tests that matter here are the ones proving they stayed gone: a removed
endpoint that quietly comes back is a scope hole nobody notices, because
nothing fails.
"""

import pytest
from django.urls import reverse

from apps.accounts.models import RoleAssignment
from apps.common.roles import resolve_role
from tests import factories

pytestmark = pytest.mark.django_db


LOGIN = "/api/v1/auth/login/"
ME = "/api/v1/auth/me/"
REFRESH = "/api/v1/auth/refresh/"


# ── Login ─────────────────────────────────────────────────────────────────────


def test_login_returns_a_token_and_the_users_role(api, nrb_hos):
    response = api.post(LOGIN, {"username": "nrb_hos", "password": "pw"}, format="json")
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["accessToken"]
    assert body["user"]["active_role"]["role"] == "hos"


def test_login_rejects_a_bad_password(api, nrb_hos):
    assert api.post(
        LOGIN, {"username": "nrb_hos", "password": "wrong"}, format="json"
    ).status_code == 401


def test_me_reports_the_current_role(api, nrb_electrician):
    api.force_authenticate(nrb_electrician)
    response = api.get(ME)
    assert response.status_code == 200
    assert response.json()["active_role"]["role"] == "technician"


def test_me_reflects_a_role_change_immediately(api, nrb_electrician, nrb_section):
    """The assignment is re-read from the database rather than taken from the
    token, so an admin's change lands on the next call — not at token expiry."""
    api.force_authenticate(nrb_electrician)
    assert api.get(ME).json()["active_role"]["role"] == "technician"

    RoleAssignment.objects.filter(user=nrb_electrician).delete()
    RoleAssignment.objects.create(
        user=nrb_electrician, role="hos", section=nrb_section
    )

    assert api.get(ME).json()["active_role"]["role"] == "hos"


# ── One role, no switching ────────────────────────────────────────────────────


def test_a_user_can_hold_only_one_role(nrb_electrician, nrb_section):
    """OneToOne — the database refuses a second row rather than leaving two
    assignments for the scope code to pick between."""
    from django.db import IntegrityError, transaction

    with pytest.raises(IntegrityError), transaction.atomic():
        RoleAssignment.objects.create(
            user=nrb_electrician, role="hos", section=nrb_section
        )


def test_me_does_not_offer_a_list_of_roles(api, nrb_electrician):
    """`available_roles` existing again would mean role switching had returned."""
    api.force_authenticate(nrb_electrician)
    assert "available_roles" not in api.get(ME).json()


def test_the_switch_role_endpoint_is_gone(api, nrb_electrician):
    api.force_authenticate(nrb_electrician)
    response = api.post("/api/v1/auth/switch-role/", {}, format="json")
    assert response.status_code == 404


def test_role_assignments_carry_no_validity_window():
    """Cover was time-boxed; without those fields it cannot be reintroduced by
    accident."""
    names = {f.name for f in RoleAssignment._meta.get_fields()}
    assert not names & {"is_primary", "valid_from", "valid_until"}


def test_role_assignment_has_no_activity_helpers():
    for gone in ("is_active", "is_demoted"):
        assert not hasattr(RoleAssignment, gone)


# ── Role resolution ───────────────────────────────────────────────────────────


def test_role_resolves_from_the_jwt_claim_first(api, nrb_electrician):
    """The claim is authoritative for the request; the database is the fallback
    for test clients that never issue a token."""

    class Request:
        auth = {"role": "hos"}
        user = nrb_electrician

    assert resolve_role(Request()) == "hos"


def test_role_falls_back_to_the_assignment_without_a_token(nrb_electrician):
    class Request:
        auth = None
        user = nrb_electrician

    assert resolve_role(Request()) == "technician"


def test_a_user_with_no_assignment_has_no_role(db, nrb):
    roleless = factories.make_user("roleless", campus=nrb)

    class Request:
        auth = None
        user = roleless

    assert resolve_role(Request()) is None


def test_scope_fails_closed_for_a_roleless_user(db, nrb, nrb_electrical_ticket):
    """No role must mean no tickets, never all tickets."""
    from apps.tickets.services.scope import scoped_ticket_qs

    roleless = factories.make_user("roleless2", campus=nrb)
    assert not scoped_ticket_qs(roleless, None).exists()


# ── Registration ──────────────────────────────────────────────────────────────


def test_registration_creates_a_plain_requester(api, nrb, db):
    response = api.post(
        "/api/v1/auth/register/",
        {
            "email": "newstarter@ksg.ac.ke",
            "password": "Str0ngPassphrase!",
            "first_name": "New",
            "last_name": "Starter",
            "campus_id": nrb.id,
        },
        format="json",
    )
    assert response.status_code in (200, 201), response.json()
    assert response.json()["user"]["active_role"]["role"] == "user"


def test_anyone_may_list_campuses_before_logging_in(api, nrb, msa):
    """The registration form needs them, and a campus list is not a secret."""
    response = api.get("/api/v1/auth/campuses/")
    assert response.status_code == 200
    assert {row["code"] for row in response.json()} >= {"NRB", "MSA"}


def test_me_requires_authentication(api):
    assert api.get(ME).status_code == 401
