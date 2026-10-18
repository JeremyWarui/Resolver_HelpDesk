"""Login, refresh, and the single role each user carries.

Each user holds exactly one role, with no switching. These hold that in place,
because a scope hole that comes back quietly fails nothing.
"""

import pytest
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import RoleAssignment
from apps.accounts.posts import assign_role
from apps.accounts.views import REFRESH_COOKIE
from apps.common.roles import resolve_role
from tests import factories

pytestmark = pytest.mark.django_db


LOGIN = "/api/v1/auth/login/"
ME = "/api/v1/auth/me/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"


def test_login_returns_a_token_and_the_users_role(api, nrb_hos):
    response = api.post(
        LOGIN, {"email": "nrb_hos@example.test", "password": "pw"}, format="json"
    )
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["accessToken"]
    assert body["user"]["active_role"]["role"] == "hos"


def test_login_rejects_a_bad_password(api, nrb_hos):
    assert api.post(
        LOGIN, {"email": "nrb_hos@example.test", "password": "wrong"}, format="json"
    ).status_code == 401


def test_me_reports_the_current_role(api, nrb_electrician):
    api.force_authenticate(nrb_electrician)
    response = api.get(ME)
    assert response.status_code == 200
    assert response.json()["active_role"]["role"] == "technician"


def test_a_user_can_hold_only_one_role(nrb_electrician, nrb):
    """OneToOne — the database refuses a second row rather than leaving two
    assignments for the scope code to pick between."""
    from django.db import IntegrityError, transaction

    with pytest.raises(IntegrityError), transaction.atomic():
        RoleAssignment.objects.create(
            user=nrb_electrician, role="hos", campus=nrb
        )


def test_a_user_with_no_assignment_has_no_role(db, nrb):
    roleless = factories.make_user("roleless", campus=nrb)

    class Request:
        auth = None
        user = roleless

    assert resolve_role(Request()) is None


def test_scope_fails_closed_for_a_roleless_user(db, nrb, nrb_electrical_ticket):
    """No role must mean no tickets, never all tickets."""
    from apps.tickets.scope import scoped_ticket_qs

    roleless = factories.make_user("roleless2", campus=nrb)
    assert not scoped_ticket_qs(roleless, None).exists()


REGISTER = "/api/v1/auth/register/"


def _register(api, email, campus, password="Str0ngPassphrase!"):
    return api.post(
        REGISTER,
        {"email": email, "password": password, "campus_id": campus.id},
        format="json",
    )


def test_registering_creates_the_account_without_signing_in(api, nrb, db):
    """The person signs in next, with the address they just gave."""
    response = _register(api, "new.starter@ksg.ac.ke", nrb)

    assert response.status_code == 201
    assert response.json()["email"] == "new.starter@ksg.ac.ke"
    assert "accessToken" not in response.json()
    assert "resolver_refresh" not in response.cookies


def test_a_registered_user_can_sign_in_with_their_email(api, nrb, db):
    """What you register with is what you log in with, without ever being told
    a username."""
    assert _register(api, "log.inagain@ksg.ac.ke", nrb).status_code == 201
    response = api.post(
        LOGIN,
        {"email": "log.inagain@ksg.ac.ke", "password": "Str0ngPassphrase!"},
        format="json",
    )
    assert response.status_code == 200, response.json()


def test_me_requires_authentication(api):
    assert api.get(ME).status_code == 401


def _login(api, user, password="pw"):
    """Sign in over the wire, so the refresh cookie lands in the client's jar."""
    response = api.post(
        LOGIN, {"email": user.email, "password": password}, format="json"
    )
    assert response.status_code == 200, response.json()
    return response


def test_refresh_issues_a_usable_access_token(api, nrb_hos):
    _login(api, nrb_hos)

    response = api.post(REFRESH)
    assert response.status_code == 200, response.json()
    assert response.json()["role"] == "hos"

    api.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['accessToken']}")
    assert api.get(ME).json()["active_role"]["role"] == "hos"


def test_refresh_reports_the_role_the_database_now_holds(api, requester, nrb):
    """Claims are re-read from the database rather than copied forward, so a
    promotion lands on the next silent refresh instead of at the next login."""
    _login(api, requester)
    assign_role(requester, "hos", campus=nrb)

    body = api.post(REFRESH).json()
    assert body["role"] == "hos"
    assert AccessToken(body["accessToken"])["role"] == "hos"


def test_refresh_reports_null_for_an_account_holding_no_post(api, nrb):
    """Registering creates the account, not an assignment, so a new sign-up
    has no role row until an admin grants one. The client stores such a user
    as `user` and the wire says null; `reconcileRole` reads the two as equal,
    which is what keeps this account from being signed out on every rotation.
    """
    newcomer = factories.make_user("newcomer", campus=nrb)
    assert not RoleAssignment.objects.filter(user=newcomer).exists()
    _login(api, newcomer)

    assert api.post(REFRESH).json()["role"] is None


def test_logging_out_blacklists_the_refresh_token(api, nrb_hos):
    _login(api, nrb_hos)
    token = api.cookies[REFRESH_COOKIE].value
    api.force_authenticate(nrb_hos)

    assert api.post(LOGOUT).status_code == 204

    # Logout clears the cookie too, so replay the value to prove the token is
    # dead rather than merely forgotten by this client.
    api.force_authenticate(None)
    api.cookies[REFRESH_COOKIE] = token
    assert api.post(REFRESH).status_code == 401


def _assign_role(api, user, **scope):
    return api.post(
        f"/api/v1/users/{user.id}/role-assignments/",
        {"role": scope.pop("role"), **scope},
        format="json",
    )


def test_admin_can_promote_a_requester_to_hos(
    api,
    admin_user,
    requester,
    nrb,
):
    api.force_authenticate(admin_user)
    response = _assign_role(
        api,
        requester,
        role="hos",
        campus_id=nrb.id,
    )

    assert response.status_code == 201, response.json()
    ra = RoleAssignment.objects.get(user=requester)
    assert ra.role == "hos"
    assert ra.campus_id == nrb.id


def test_promoting_replaces_the_single_role_rather_than_adding_one(
    api,
    admin_user,
    requester,
    nrb,
):
    """One row per user is the invariant; a promotion must not leave two."""
    api.force_authenticate(admin_user)
    for _ in range(2):
        assert _assign_role(
            api,
            requester,
            role="hos",
            campus_id=nrb.id,
        ).status_code == 201

    assert RoleAssignment.objects.filter(user=requester).count() == 1


def test_only_an_admin_may_assign_a_role(api, nrb_hos, requester, nrb):
    """An HOS promoting people would be an escalation path around the org chart."""
    api.force_authenticate(nrb_hos)
    response = _assign_role(
        api, requester, role="hos", campus_id=nrb.id
    )
    assert response.status_code == 403
    assert RoleAssignment.objects.get(user=requester).role == "user"
